/**
 * Индекс ссылок и поисковый индекс. Текст — источник истины для связей:
 * индекс пересчитывается при сохранении страницы или материала (раздел 6 ТЗ).
 */
import { norm, plainText, scanLinks } from '../../core/text';
import type { Concept, LinkRow, Note, RelationType } from '../../core/types';
import { cached, type Ctx } from '../context';
import { conceptsRepo, notesRepo } from '../repositories/content';
import { linksRepo, typesRepo } from '../repositories/graph';
import { searchRepo } from '../repositories/search';

export const relationTypes = (ctx: Ctx): RelationType[] => cached(ctx, 'types', () => typesRepo.all(ctx));

/** Текст после черты — тип связи, если совпадает с названием из справочника; иначе это просто подпись. */
export function resolveTypeId(label: string | null, types: RelationType[]): string | null {
  if (!label) return null;
  const key = norm(label);
  return types.find((t) => norm(t.name) === key)?.id ?? null;
}

const titleIndex = (ctx: Ctx): Map<string, string> =>
  cached(ctx, 'titleIndex', () => new Map(conceptsRepo.titles(ctx).map((c) => [norm(c.title), c.id])));

function linkTargets(ctx: Ctx, text: string): { targetId: string; typeId: string | null }[] {
  const types = relationTypes(ctx);
  const index = titleIndex(ctx);
  const seen = new Set<string>();
  const out: { targetId: string; typeId: string | null }[] = [];
  for (const l of scanLinks(text)) {
    const targetId = index.get(norm(l.title));
    if (!targetId) continue;
    const typeId = resolveTypeId(l.label, types);
    const key = `${targetId}|${typeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ targetId, typeId });
  }
  return out;
}

export function reindexPage(ctx: Ctx, id: string): void {
  const c = conceptsRepo.get(ctx, id);
  const rows = c ? linkTargets(ctx, c.body).filter((t) => t.targetId !== id).map((t) => ({ sourceId: id, ...t })) : [];
  linksRepo.replaceOrigin(ctx, 'page', id, rows);
  ctx.cache.delete('edges');
}

/** Ссылка в материале даёт связь от всех страниц, к которым он привязан; входящие связей не дают. */
export function reindexNote(ctx: Ctx, id: string): void {
  const n = notesRepo.get(ctx, id);
  const rows: Omit<LinkRow, 'originKind' | 'originId'>[] = [];
  if (n && !n.inbox) {
    const targets = linkTargets(ctx, n.content);
    for (const sourceId of n.conceptIds) {
      for (const t of targets) if (t.targetId !== sourceId) rows.push({ sourceId, ...t });
    }
  }
  linksRepo.replaceOrigin(ctx, 'note', id, rows);
  ctx.cache.delete('edges');
}

/** Пересчитывает тексты, где есть ссылка на название: нужно, когда страница появилась или переименована. */
export function reindexReferencing(ctx: Ctx, title: string): void {
  const key = norm(title);
  const refers = (text: string) => scanLinks(text).some((l) => norm(l.title) === key);
  for (const r of ctx.db.all<{ id: string; body: string }>(`SELECT id, body FROM concepts WHERE deleted = 0 AND instr(body, '[[') > 0`)) {
    if (refers(r.body)) reindexPage(ctx, r.id);
  }
  for (const r of ctx.db.all<{ id: string; content: string }>(
    `SELECT id, content FROM notes WHERE deleted = 0 AND inbox = 0 AND instr(content, '[[') > 0`,
  )) {
    if (refers(r.content)) reindexNote(ctx, r.id);
  }
}

export function indexSearchPage(ctx: Ctx, c: Concept): void {
  searchRepo.put(ctx, 'page', c.id, c.title, `${plainText(c.body)}\n${c.tags.join(' ')}`);
}

export function indexSearchNote(ctx: Ctx, n: Note): void {
  searchRepo.put(ctx, 'note', n.id, n.title, plainText(n.content));
}

/** Полная перестройка обоих индексов — после восстановления из копии и разблокировки. */
export function reindexAll(ctx: Ctx): void {
  linksRepo.clear(ctx);
  searchRepo.clear(ctx);
  ctx.cache.clear();
  for (const c of conceptsRepo.all(ctx)) {
    reindexPage(ctx, c.id);
    indexSearchPage(ctx, c);
  }
  for (const n of notesRepo.all(ctx)) {
    reindexNote(ctx, n.id);
    indexSearchNote(ctx, n);
  }
}
