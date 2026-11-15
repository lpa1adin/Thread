/** Помощник для тестов и экспериментов: движок с базой SQLite в памяти (та же схема, что в браузере). */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Ctx } from './context';
import { Engine, type Api } from './engine';
import { Sql } from './storage/sql';

let modulePromise: ReturnType<typeof sqlite3InitModule> | null = null;

export async function memoryDbFactory(): Promise<() => Sql> {
  modulePromise ??= sqlite3InitModule();
  const sqlite3 = await modulePromise;
  return () => new Sql(new sqlite3.oo1.DB(':memory:'));
}

/** Клиент с теми же методами, что и в интерфейсе, но без воркера. */
export function clientFor(engine: Engine): Api {
  const group = (g: string) =>
    new Proxy({}, { get: (_t, m: string) => async (...args: unknown[]) => (await engine.call(g, m, args)).result });
  return new Proxy({}, { get: (_t, g: string) => group(g) }) as Api;
}

export async function createTestEngine(): Promise<{ engine: Engine; api: Api; pdb: Sql }> {
  const make = await memoryDbFactory();
  const pdb = make();
  const engine = new Engine(pdb, make);
  return { engine, api: clientFor(engine), pdb };
}

export function testCtx(db: Sql): Ctx {
  const cache = new Map<string, unknown>();
  return { db, now: () => Date.now(), uuid: () => crypto.randomUUID(), mark: () => cache.clear(), cache };
}
