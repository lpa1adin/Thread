/** Полнотекстовый индекс FTS5 (F14). */
import type { Ctx } from '../context';

export interface SearchRow {
  kind: 'page' | 'note';
  ref: string;
  title: string;
  snippet: string;
}

export const searchRepo = {
  put(ctx: Ctx, kind: 'page' | 'note', ref: string, title: string, body: string): void {
    this.remove(ctx, kind, ref);
    ctx.db.run('INSERT INTO search (kind, ref, title, body) VALUES (?,?,?,?)', [kind, ref, title, body]);
  },

  remove(ctx: Ctx, kind: 'page' | 'note', ref: string): void {
    ctx.db.run('DELETE FROM search WHERE kind = ? AND ref = ?', [kind, ref]);
  },

  clear(ctx: Ctx): void {
    ctx.db.run('DELETE FROM search');
  },

  /** match — уже подготовленное выражение FTS5; совпадение в названии весит больше, чем в тексте. */
  query(ctx: Ctx, match: string, limit: number): SearchRow[] {
    return ctx.db.all<SearchRow>(
      `SELECT kind, ref, title, snippet(search, 3, char(1), char(2), '…', 14) snippet
       FROM search WHERE search MATCH ? ORDER BY bm25(search, 0.0, 0.0, 8.0, 1.0) LIMIT ?`,
      [match, limit],
    );
  },
};
