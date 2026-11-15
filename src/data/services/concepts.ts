/** Страницы понятий (F1, F3, F6, F19). */
import { CONCEPT_TYPES, LIMITS, STATUSES } from '../../core/constants';
import { cleanTitle, excerpt, norm, renameLinks, scanLinks, taskStats, toggleTaskAtLine } from '../../core/text';
import { AppError, type Concept, type ConceptBrief, type ConceptType, type Status } from '../../core/types';
import { cached, type Ctx } from '../context';
import { conceptsRepo, notesRepo } from '../repositories/content';
import { linksRepo, relationsRepo } from '../repositories/graph';
import { searchRepo } from '../repositories/search';
import { indexSearchNote, indexSearchPage, reindexNote, reindexPage, reindexReferencing } from './indexing';

export interface ConceptInput {
  title: string;
  type?: ConceptType;
  status?: Status;
  body?: string;
  tags?: string[];
  marked?: boolean;
}

export function validTitle(raw: string): string {
  const title = cleanTitle(String(raw ?? ''));
  if (!title) throw new AppError('title-empty', 'Введите название страницы');
  if (title.length > LIMITS.titleLength) throw new AppError('title-long', `Название длиннее ${LIMITS.titleLength} символов`);
  return title;
}

export function validText(raw: unknown): string {
  const text = String(raw ?? '');
  if (text.length > LIMITS.textLength) throw new AppError('text-long', 'Текст слишком большой — разделите его на несколько страниц');
  return text;
}

export function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const name = String(raw).replace(/^#+/, '').replace(/[,\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.tagLength);
    const key = norm(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= LIMITS.tagsPerPage) break;
  }
  return out;
}

const validType = (t: unknown): ConceptType => (typeof t === 'string' && t in CONCEPT_TYPES ? (t as ConceptType) : 'concept');
const validStatus = (s: unknown): Status => (typeof s === 'string' && s in STATUSES ? (s as Status) : 'later');

function mustGet(ctx: Ctx, id: string): Concept {
  const c = conceptsRepo.get(ctx, id);
  if (!c) throw new AppError('not-found', 'Страница не найдена — возможно, она удалена');
  return c;
}

export function briefs(ctx: Ctx): Map<string, ConceptBrief> {
  return cached(ctx, 'briefs', () => {
    const counts = new Map(
      ctx.db
        .all<{ id: string; n: number }>(
          `SELECT cn.concept_id id, count(*) n FROM concept_notes cn JOIN notes n ON n.id = cn.note_id AND n.deleted = 0 GROUP BY cn.concept_id`,
        )
        .map((r) => [r.id, r.n]),
    );
    const map = new Map<string, ConceptBrief>();
    for (const c of conceptsRepo.all(ctx)) {
      const tasks = taskStats(c.body);
      map.set(c.id, {
        id: c.id,
        title: c.title,
        type: c.type,
        status: c.status,
        marked: c.marked,
        empty: !c.body.trim(),
        tasksDone: tasks.done,
        tasksAll: tasks.all,
        materials: counts.get(c.id) ?? 0,
        excerpt: excerpt(c.body),
        updatedAt: c.updatedAt,
      });
    }
    return map;
  });
}

export const conceptsService = {
  list(ctx: Ctx): ConceptBrief[] {
    return [...briefs(ctx).values()];
  },

  get(ctx: Ctx, id: string): Concept {
    return mustGet(ctx, id);
  },

  create(ctx: Ctx, input: ConceptInput): Concept {
    const title = validTitle(input.title);
    if (conceptsRepo.byTitle(ctx, title)) throw new AppError('duplicate-title', `Страница «${title}» уже есть`);
    const now = ctx.now();
    const c: Concept = {
      id: ctx.uuid(),
      title,
      type: validType(input.type),
      status: validStatus(input.status),
      marked: !!input.marked,
      body: validText(input.body),
      tags: cleanTags(input.tags),
      createdAt: now,
      updatedAt: now,
    };
    conceptsRepo.insert(ctx, c);
    reindexPage(ctx, c.id);
    // Ссылки на это название, которые были «пустыми», теперь ведут на новую страницу.
    reindexReferencing(ctx, title);
    indexSearchPage(ctx, c);
    return c;
  },

  /** Возвращает существующую страницу с таким названием или создаёт новую. */
  ensure(ctx: Ctx, title: string): Concept {
    const found = conceptsRepo.byTitle(ctx, validTitle(title));
    return found ? mustGet(ctx, found.id) : this.create(ctx, { title });
  },

  update(ctx: Ctx, id: string, patch: Partial<ConceptInput>): Concept {
    const old = mustGet(ctx, id);
    let body = patch.body !== undefined ? validText(patch.body) : undefined;
    let title: string | undefined;
    if (patch.title !== undefined) {
      title = validTitle(patch.title);
      if (title === old.title) title = undefined;
      else {
        const other = conceptsRepo.byTitle(ctx, title);
        if (other && other.id !== id) throw new AppError('duplicate-title', `Страница «${title}» уже есть`);
      }
    }
    if (title) {
      // F6: ссылки на страницу во всех текстах получают новое название.
      for (const r of ctx.db.all<{ id: string; body: string }>(`SELECT id, body FROM concepts WHERE deleted = 0 AND id <> ? AND instr(body, '[[') > 0`, [id])) {
        const next = renameLinks(r.body, old.title, title);
        if (next !== r.body) {
          conceptsRepo.update(ctx, r.id, { body: next });
          indexSearchPage(ctx, conceptsRepo.get(ctx, r.id)!);
        }
      }
      for (const r of ctx.db.all<{ id: string; content: string }>(`SELECT id, content FROM notes WHERE deleted = 0 AND instr(content, '[[') > 0`)) {
        const next = renameLinks(r.content, old.title, title);
        if (next !== r.content) {
          notesRepo.update(ctx, r.id, { content: next });
          indexSearchNote(ctx, notesRepo.get(ctx, r.id)!);
        }
      }
      body = renameLinks(body ?? old.body, old.title, title);
    }
    conceptsRepo.update(ctx, id, {
      title,
      body,
      type: patch.type !== undefined ? validType(patch.type) : undefined,
      status: patch.status !== undefined ? validStatus(patch.status) : undefined,
      marked: patch.marked,
    });
    if (patch.tags !== undefined) conceptsRepo.setTags(ctx, id, cleanTags(patch.tags));
    ctx.cache.clear();
    if (body !== undefined) reindexPage(ctx, id);
    if (title) reindexReferencing(ctx, title);
    const next = mustGet(ctx, id);
    indexSearchPage(ctx, next);
    return next;
  },

  /**
   * F3: ссылка на несуществующую страницу создаёт её. Вызывается при выходе из редактора,
   * а не при автосохранении, чтобы не создавать страницы из недописанных названий.
   * keepEmpty — «пустые» ссылки, которые были в тексте до правки (например, на удалённую страницу).
   */
  createMissing(ctx: Ctx, text: string, keepEmpty: string[] = []): string[] {
    const keep = new Set(keepEmpty.map(norm));
    const created: string[] = [];
    for (const l of scanLinks(text)) {
      const key = norm(l.title);
      if (keep.has(key) || conceptsRepo.byTitle(ctx, l.title)) continue;
      keep.add(key);
      created.push(this.create(ctx, { title: l.title }).title);
    }
    return created;
  },

  finishEditing(ctx: Ctx, id: string, keepEmpty: string[] = []): string[] {
    return this.createMissing(ctx, mustGet(ctx, id).body, keepEmpty);
  },

  toggleTask(ctx: Ctx, id: string, line: number): void {
    const c = mustGet(ctx, id);
    const body = toggleTaskAtLine(c.body, line);
    if (body !== c.body) conceptsRepo.update(ctx, id, { body });
  },

  /** F6: мягкое удаление; ссылки на страницу в текстах остаются и показываются как «пустые». */
  remove(ctx: Ctx, id: string): void {
    mustGet(ctx, id);
    for (const rid of relationsRepo.idsOfConcept(ctx, id)) relationsRepo.softDelete(ctx, rid);
    const notes = notesRepo.forConcept(ctx, id);
    linksRepo.deleteForConcept(ctx, id);
    for (const n of notes) {
      const rest = n.conceptIds.filter((c) => c !== id);
      notesRepo.setConcepts(ctx, n.id, rest);
      // Материал, оставшийся без страниц, возвращается во входящие, а не теряется.
      if (!rest.length) notesRepo.update(ctx, n.id, { inbox: true });
      reindexNote(ctx, n.id);
    }
    searchRepo.remove(ctx, 'page', id);
    conceptsRepo.update(ctx, id, { deleted: true });
    ctx.cache.clear();
  },
};
