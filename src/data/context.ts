import type { Sql } from './storage/sql';

export type VaultKind = 'concept' | 'note' | 'relation';

/** Контекст одного вызова сервиса: рабочая БД, часы и учёт изменённых объектов. */
export interface Ctx {
  db: Sql;
  now(): number;
  uuid(): string;
  /** Отмечает изменённый объект: сбрасывает кеш и ставит объект в очередь на шифрование (S2). */
  mark(kind: VaultKind, id: string): void;
  /** Кеш производных данных (рёбра графа, краткие сведения) — живёт до следующего изменения. */
  cache: Map<string, unknown>;
}

export function cached<T>(ctx: Ctx, key: string, make: () => T): T {
  if (!ctx.cache.has(key)) ctx.cache.set(key, make());
  return ctx.cache.get(key) as T;
}
