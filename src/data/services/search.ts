/** Полнотекстовый поиск по страницам и материалам с фрагментом найденного текста (F14). */
import { excerpt, norm } from '../../core/text';
import type { SearchHit } from '../../core/types';
import type { Ctx } from '../context';
import { notesRepo } from '../repositories/content';
import { searchRepo } from '../repositories/search';
import { briefs } from './concepts';

/** Запрос пользователя → выражение FTS5: каждое слово ищется по началу, все слова обязательны. */
export function toMatchExpression(query: string): string | null {
  const words = (String(query).toLocaleLowerCase('ru').match(/[\p{L}\p{N}_]+/gu) ?? []).slice(0, 8);
  return words.length ? words.map((w) => `"${w}"*`).join(' ') : null;
}

export const searchService = {
  query(ctx: Ctx, query: string, limit = 30): SearchHit[] {
    const match = toMatchExpression(query);
    if (!match) return [];
    const pages = briefs(ctx);
    const hits: SearchHit[] = [];
    for (const r of searchRepo.query(ctx, match, Math.max(1, Math.min(100, limit)))) {
      const snippet = r.snippet.includes('\u0001') ? r.snippet.replace(/\s+/g, ' ') : excerpt(r.snippet, 120);
      if (r.kind === 'page') {
        const b = pages.get(r.ref);
        if (b) hits.push({ kind: 'page', id: r.ref, title: b.title, snippet, inbox: false, pageId: r.ref, type: b.type });
      } else {
        const n = notesRepo.get(ctx, r.ref);
        if (n) hits.push({ kind: 'note', id: n.id, title: n.title, snippet, inbox: n.inbox, pageId: n.conceptIds[0] ?? null });
      }
    }
    // Сначала то, что найдено по названию (страницы перед материалами), затем найденное в тексте.
    const words = match.match(/[\p{L}\p{N}_]+/gu) ?? [];
    const rank = (h: SearchHit) => {
      const title = norm(h.title);
      if (!words.every((w) => title.includes(w))) return 4;
      return (title.startsWith(words[0] ?? '') ? 0 : 2) + (h.kind === 'page' ? 0 : 1);
    };
    return hits
      .map((h, i) => ({ h, i, r: rank(h) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((x) => x.h);
  },
};
