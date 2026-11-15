/** Резервная копия, восстановление и экспорт в Markdown (F16). Проверка формата и размера файла — S6. */
import { CONCEPT_TYPES, LIMITS, RELATION_TYPES, STATUSES } from '../../core/constants';
import { cleanTitle, norm } from '../../core/text';
import { fromBase64 } from '../../core/crypto';
import { attachmentsRepo } from '../repositories/attachments';
import { validImage } from './attachments';
import { AppError, type Attachment, type BackupFile, type Concept, type ConceptType, type DataSet, type Note, type Relation, type Status } from '../../core/types';
import type { Ctx } from '../context';
import { conceptsRepo, notesRepo } from '../repositories/content';
import { relationsRepo } from '../repositories/graph';
import { DATA_TABLES } from '../storage/schema';
import { cleanTags } from './concepts';
import { reindexAll } from './indexing';

const bad = (why: string) => new AppError('bad-backup', `Файл не похож на резервную копию базы знаний: ${why}`);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number, what: string): string => {
  if (typeof v !== 'string') throw bad(`${what} — не строка`);
  if (v.length > max) throw bad(`${what} слишком длинное`);
  return v;
};
const id = (v: unknown, what: string) => {
  const s = str(v, 64, what);
  if (!/^[\w-]{1,64}$/.test(s)) throw bad(`${what} содержит недопустимые символы`);
  return s;
};
const time = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback);

/**
 * Разбирает и проверяет JSON копии. Принимает формат приложения и формат кликабельного прототипа
 * (поля s/t/type у связей, tags и conceptIds внутри объектов).
 */
export function parseBackup(json: string, now: number): DataSet {
  if (typeof json !== 'string' || json.length > LIMITS.backupBytes) throw bad('файл слишком большой');
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw bad('это не JSON');
  }
  if (!isObj(raw) || !Array.isArray(raw.concepts)) throw bad('нет списка страниц');
  if (raw.concepts.length > 100_000) throw bad('слишком много страниц');
  const typeIds = new Set(RELATION_TYPES.map((t) => t.id));

  const concepts: Concept[] = raw.concepts.map((c, i) => {
    if (!isObj(c)) throw bad(`страница ${i + 1} повреждена`);
    const title = cleanTitle(str(c.title, LIMITS.titleLength * 2, 'название страницы')).slice(0, LIMITS.titleLength);
    if (!title) throw bad(`у страницы ${i + 1} нет названия`);
    const created = time(c.createdAt, now);
    return {
      id: id(c.id, 'идентификатор страницы'),
      title,
      type: (typeof c.type === 'string' && c.type in CONCEPT_TYPES ? c.type : 'concept') as ConceptType,
      status: (typeof c.status === 'string' && c.status in STATUSES ? c.status : 'later') as Status,
      marked: c.marked === true,
      body: str(c.body ?? '', LIMITS.textLength, 'текст страницы'),
      tags: cleanTags(c.tags),
      createdAt: created,
      updatedAt: time(c.updatedAt, created),
    };
  });
  const conceptIds = new Set(concepts.map((c) => c.id));
  if (conceptIds.size !== concepts.length) throw bad('повторяются идентификаторы страниц');

  const notes: Note[] = (Array.isArray(raw.notes) ? raw.notes : []).map((n, i) => {
    if (!isObj(n)) throw bad(`материал ${i + 1} повреждён`);
    const created = time(n.createdAt ?? n.created, now);
    const attached = (Array.isArray(n.conceptIds) ? n.conceptIds : []).filter((c): c is string => typeof c === 'string' && conceptIds.has(c));
    return {
      id: id(n.id, 'идентификатор материала'),
      title: str(n.title ?? '', LIMITS.titleLength * 2, 'заголовок материала').slice(0, LIMITS.titleLength) || 'Без названия',
      content: str(n.content ?? '', LIMITS.textLength, 'текст материала'),
      inbox: attached.length === 0,
      conceptIds: [...new Set(attached)],
      createdAt: created,
      updatedAt: time(n.updatedAt, created),
    };
  });
  if (new Set(notes.map((n) => n.id)).size !== notes.length) throw bad('повторяются идентификаторы материалов');

  const relations: Relation[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(raw.relations) ? raw.relations : []) {
    if (!isObj(r)) throw bad('связь повреждена');
    const sourceId = r.sourceId ?? r.s;
    const targetId = r.targetId ?? r.t;
    const typeId = r.typeId ?? r.type;
    // Связи на отсутствующие страницы и неизвестные типы пропускаются: целостность важнее полноты.
    if (typeof sourceId !== 'string' || typeof targetId !== 'string' || typeof typeId !== 'string') continue;
    if (!conceptIds.has(sourceId) || !conceptIds.has(targetId) || sourceId === targetId || !typeIds.has(typeId)) continue;
    const key = `${sourceId}|${targetId}|${typeId}`;
    const rid = id(r.id, 'идентификатор связи');
    if (seen.has(key) || seen.has(rid)) continue;
    seen.add(key).add(rid);
    const created = time(r.createdAt, now);
    relations.push({ id: rid, sourceId, targetId, typeId, createdAt: created, updatedAt: time(r.updatedAt, created) });
  }

  // Изображения: содержимое проверяется так же, как при обычной вставке.
  const attachments: Attachment[] = [];
  const imageIds = new Set<string>();
  for (const a of Array.isArray(raw.attachments) ? raw.attachments : []) {
    if (!isObj(a)) throw bad('изображение повреждено');
    const aid = id(a.id, 'идентификатор изображения');
    if (imageIds.has(aid)) continue;
    let bytes: Uint8Array;
    try {
      bytes = fromBase64(str(a.data, LIMITS.imageBytes * 2, 'содержимое изображения'));
    } catch {
      throw bad('изображение повреждено');
    }
    let img: ReturnType<typeof validImage>;
    try {
      img = validImage(a.name, bytes);
    } catch {
      throw bad('в файле есть вложение, которое не является изображением');
    }
    imageIds.add(aid);
    attachments.push({ id: aid, name: img.name, mime: img.mime, size: bytes.length, createdAt: time(a.createdAt, now), data: a.data as string });
  }

  // Названия уникальны без учёта регистра: повторы получают номер.
  const titles = new Set<string>();
  for (const c of concepts) {
    let title = c.title;
    for (let n = 2; titles.has(norm(title)); n++) title = `${c.title} (${n})`;
    titles.add(norm(title));
    c.title = title;
  }
  return { concepts, notes, relations, attachments };
}

export const backupService = {
  /** includeDeleted — вместе с пометками удаления (нужно для шифрованного хранилища и синхронизации). */
  exportData(ctx: Ctx, includeDeleted = false): DataSet {
    return {
      concepts: conceptsRepo.all(ctx, includeDeleted),
      notes: notesRepo.all(ctx, includeDeleted),
      relations: relationsRepo.all(ctx, includeDeleted),
      attachments: attachmentsRepo.all(ctx),
    };
  },

  exportBackup(ctx: Ctx): BackupFile {
    return { format: 'kb-backup', version: 1, exportedAt: ctx.now(), ...this.exportData(ctx) };
  },

  /** Удаляет все данные пользователя. Объекты отмечаются, чтобы исчезнуть и из шифрованного хранилища. */
  wipe(ctx: Ctx): void {
    for (const r of ctx.db.all<{ id: string }>('SELECT id FROM concepts')) ctx.mark('concept', r.id);
    for (const r of ctx.db.all<{ id: string }>('SELECT id FROM notes')) ctx.mark('note', r.id);
    for (const r of ctx.db.all<{ id: string }>('SELECT id FROM relations')) ctx.mark('relation', r.id);
    for (const r of ctx.db.all<{ id: string }>('SELECT id FROM attachments')) ctx.mark('attachment', r.id);
    for (const t of DATA_TABLES) ctx.db.run(`DELETE FROM ${t}`);
    ctx.cache.clear();
  },

  /** Загружает набор данных в пустую базу и перестраивает индексы. */
  load(ctx: Ctx, data: DataSet): void {
    const alive = new Set<string>();
    for (const c of data.concepts) {
      conceptsRepo.insert(ctx, c);
      alive.add(c.id);
    }
    for (const n of data.notes) notesRepo.insert(ctx, { ...n, conceptIds: n.conceptIds.filter((c) => alive.has(c)) });
    for (const r of data.relations) if (alive.has(r.sourceId) && alive.has(r.targetId)) relationsRepo.insert(ctx, r);
    for (const a of data.attachments ?? []) attachmentsRepo.insertEncoded(ctx, a);
    reindexAll(ctx);
  },

  /** Восстановление: текущие данные заменяются содержимым копии (в одной транзакции). */
  restore(ctx: Ctx, json: string): { concepts: number; notes: number } {
    const data = parseBackup(json, ctx.now());
    this.wipe(ctx);
    this.load(ctx, data);
    return { concepts: data.concepts.length, notes: data.notes.length };
  },

  replaceWith(ctx: Ctx, data: DataSet): void {
    this.wipe(ctx);
    this.load(ctx, data);
  },

  /** Переносимость данных: все страницы с материалами одним Markdown-файлом. */
  exportMarkdown(ctx: Ctx): string {
    const notes = notesRepo.all(ctx);
    const pages = conceptsRepo.all(ctx).map((c) => {
      const meta = [`тип: ${CONCEPT_TYPES[c.type].name}`, `статус: ${STATUSES[c.status]}`, ...(c.tags.length ? [`теги: ${c.tags.map((t) => '#' + t).join(' ')}`] : [])];
      const mats = notes.filter((n) => n.conceptIds.includes(c.id)).map((n) => `\n\n## Материал: ${n.title}\n\n${n.content.trim()}`);
      return `# ${c.title}\n\n_${meta.join(' · ')}_\n\n${c.body.trim()}${mats.join('')}`;
    });
    const inbox = notes.filter((n) => n.inbox).map((n) => `## ${n.title}\n\n${n.content.trim()}`);
    if (inbox.length) pages.push(`# Входящие\n\n${inbox.join('\n\n')}`);
    return pages.join('\n\n---\n\n') + '\n';
  },
};
