/** Материалы и «Входящие» (F7, F12, F16 — импорт Markdown). */
import { LIMITS } from '../../core/constants';
import { defaultTitle, findMentions, norm, scanLinks, toggleTaskAtLine } from '../../core/text';
import { AppError, type InboxItem, type Note } from '../../core/types';
import type { Ctx } from '../context';
import { conceptsRepo, notesRepo } from '../repositories/content';
import { searchRepo } from '../repositories/search';
import { conceptsService, validText } from './concepts';
import { indexSearchNote, reindexNote } from './indexing';

export interface NoteInput {
  id?: string;
  title?: string;
  content: string;
  conceptIds?: string[];
}

function mustGet(ctx: Ctx, id: string): Note {
  const n = notesRepo.get(ctx, id);
  if (!n) throw new AppError('not-found', 'Материал не найден — возможно, он удалён');
  return n;
}

const cleanNoteTitle = (title: string | undefined, content: string) =>
  (title ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.titleLength) || defaultTitle(content);

function emptyLinkTitles(ctx: Ctx, text: string): string[] {
  return scanLinks(text).filter((l) => !conceptsRepo.byTitle(ctx, l.title)).map((l) => l.title);
}

export const notesService = {
  get(ctx: Ctx, id: string): Note {
    return mustGet(ctx, id);
  },

  /** Материал без страниц попадает во входящие. */
  save(ctx: Ctx, input: NoteInput): Note {
    const content = validText(input.content);
    const conceptIds = [...new Set(input.conceptIds ?? [])].filter((id) => conceptsRepo.exists(ctx, id));
    const title = cleanNoteTitle(input.title, content);
    if (!title.trim() && !content.trim()) throw new AppError('note-empty', 'Напишите заголовок или текст материала');
    const inbox = conceptIds.length === 0;
    let id = input.id;
    let keepEmpty: string[] = [];
    if (id) {
      keepEmpty = emptyLinkTitles(ctx, mustGet(ctx, id).content);
      notesRepo.update(ctx, id, { title, content, inbox });
      notesRepo.setConcepts(ctx, id, conceptIds);
    } else {
      id = ctx.uuid();
      const now = ctx.now();
      notesRepo.insert(ctx, { id, title, content, inbox, conceptIds, createdAt: now, updatedAt: now });
    }
    if (!inbox) conceptsService.createMissing(ctx, content, keepEmpty);
    ctx.cache.clear();
    reindexNote(ctx, id);
    const saved = mustGet(ctx, id);
    indexSearchNote(ctx, saved);
    return saved;
  },

  /** F12: привязать материал к странице (существующей или новой по названию). */
  attach(ctx: Ctx, noteId: string, target: { id?: string; title?: string }): string {
    const n = mustGet(ctx, noteId);
    const conceptId = target.id && conceptsRepo.exists(ctx, target.id) ? target.id : conceptsService.ensure(ctx, target.title ?? '').id;
    notesRepo.setConcepts(ctx, noteId, [...n.conceptIds, conceptId]);
    notesRepo.update(ctx, noteId, { inbox: false });
    ctx.cache.clear();
    reindexNote(ctx, noteId);
    return conceptId;
  },

  detach(ctx: Ctx, noteId: string, conceptId: string): void {
    const n = mustGet(ctx, noteId);
    const rest = n.conceptIds.filter((c) => c !== conceptId);
    notesRepo.setConcepts(ctx, noteId, rest);
    if (!rest.length) notesRepo.update(ctx, noteId, { inbox: true });
    ctx.cache.clear();
    reindexNote(ctx, noteId);
  },

  /** F12: «Сделать отдельной страницей». Если страница с таким названием есть — материал привязывается к ней. */
  toPage(ctx: Ctx, noteId: string): string {
    const n = mustGet(ctx, noteId);
    const title = n.title.replace(/^(статья|видео|конспект|ссылка|заметка)\s*:\s*/i, '').trim() || n.title;
    const existing = conceptsRepo.byTitle(ctx, title);
    if (existing) return this.attach(ctx, noteId, { id: existing.id });
    const c = conceptsService.create(ctx, { title, body: n.content });
    this.remove(ctx, noteId);
    conceptsService.createMissing(ctx, c.body);
    return c.id;
  },

  toggleTask(ctx: Ctx, id: string, line: number): void {
    const n = mustGet(ctx, id);
    const content = toggleTaskAtLine(n.content, line);
    if (content !== n.content) notesRepo.update(ctx, id, { content });
  },

  remove(ctx: Ctx, id: string): void {
    mustGet(ctx, id);
    notesRepo.setConcepts(ctx, id, []);
    notesRepo.update(ctx, id, { deleted: true });
    ctx.cache.clear();
    reindexNote(ctx, id);
    searchRepo.remove(ctx, 'note', id);
  },

  /** Входящие с подсказками: страницы, названия которых встречаются в материале. */
  inbox(ctx: Ctx): InboxItem[] {
    const pages = conceptsRepo.titles(ctx);
    const byKey = new Map(pages.map((p) => [norm(p.title), p]));
    return notesRepo.inbox(ctx).map((note) => {
      const text = `${note.title}\n${note.content}`;
      const linked = scanLinks(note.content).map((l) => byKey.get(norm(l.title))).filter((p) => !!p);
      const seen = new Set<string>();
      const suggestions = [...linked, ...findMentions(text, pages)].filter((p) => !seen.has(p.id) && !!seen.add(p.id)).slice(0, 6);
      return { note, suggestions };
    });
  },

  inboxCount(ctx: Ctx): number {
    return ctx.db.get<{ n: number }>('SELECT count(*) n FROM notes WHERE inbox = 1 AND deleted = 0')!.n;
  },

  /** F16, S6: импорт Markdown-файлов во входящие с проверкой числа, размера и содержимого файлов. */
  importMarkdown(ctx: Ctx, files: { name: string; text: string }[]): number {
    if (!Array.isArray(files) || !files.length) throw new AppError('import-empty', 'Файлы не выбраны');
    if (files.length > LIMITS.importFiles) throw new AppError('import-many', `За один раз можно добавить не больше ${LIMITS.importFiles} файлов`);
    for (const f of files) {
      const name = String(f?.name ?? '');
      if (typeof f?.text !== 'string' || !/\.(md|markdown|txt)$/i.test(name)) {
        throw new AppError('import-type', `«${name}» — не текстовый файл. Подходят файлы .md и .txt`);
      }
      if (f.text.length > LIMITS.importFileBytes) throw new AppError('import-size', `«${name}» больше 1 МБ — такой файл не импортируется`);
      if (f.text.includes('\u0000')) throw new AppError('import-binary', `«${name}» не похож на текст`);
    }
    for (const f of files) {
      const heading = f.text.match(/^\s*#\s+(.+)$/m)?.[1];
      this.save(ctx, { title: heading ?? f.name.replace(/\.\w+$/, ''), content: f.text.replace(/\r\n?/g, '\n') });
    }
    return files.length;
  },
};
