/**
 * Web Worker: база SQLite (WASM) в OPFS, сервисы, поиск и шифрование работают здесь,
 * чтобы тяжёлые операции не блокировали интерфейс.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { AppError } from '../core/types';
import { Engine } from './engine';
import { Sql } from './storage/sql';

interface Request {
  id: number;
  group: string;
  method: string;
  args: unknown[];
}

let storage: 'opfs' | 'memory' = 'memory';

/**
 * База открывается только в одной вкладке: файл в OPFS нельзя безопасно делить между вкладками.
 * Блокировку ждём несколько секунд: при перезагрузке страницы прежний воркер освобождает её не мгновенно.
 */
function acquireTabLock(): Promise<boolean> {
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timeout = AbortSignal.timeout(4000);
    navigator.locks
      .request('kb-database', { signal: timeout }, () => {
        resolve(true);
        // Блокировка удерживается, пока жив воркер.
        return new Promise<void>(() => {});
      })
      .catch(() => resolve(false));
  });
}

async function boot(): Promise<Engine> {
  if (!(await acquireTabLock())) {
    throw new AppError('busy', 'Нить уже открыта в другой вкладке или окне. Закройте его и обновите эту страницу.');
  }
  const sqlite3 = await sqlite3InitModule();
  const memory = () => new Sql(new sqlite3.oo1.DB(':memory:'));
  let pdb: Sql;
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'kb', initialCapacity: 6 });
    pdb = new Sql(new pool.OpfsSAHPoolDb('/kb.sqlite3'));
    storage = 'opfs';
  } catch {
    // Запасной вариант (раздел 14 ТЗ): браузер без OPFS — данные живут до закрытия вкладки.
    pdb = memory();
    storage = 'memory';
  }
  return new Engine(pdb, memory);
}

const ready = boot();
// Операции выполняются строго по очереди: асинхронное шифрование не должно перемежаться с записью.
let queue: Promise<unknown> = ready.catch(() => undefined);

async function handle(req: Request): Promise<{ result: unknown; changed: boolean }> {
  const engine = await ready;
  if (req.group === 'boot') return { result: { storage }, changed: false };
  return engine.call(req.group, req.method, req.args);
}

self.onmessage = (ev: MessageEvent<Request>) => {
  const req = ev.data;
  queue = queue.then(async () => {
    try {
      const { result, changed } = await handle(req);
      self.postMessage({ id: req.id, ok: true, result, changed });
    } catch (e) {
      const known = e instanceof AppError;
      if (!known) console.error(e);
      self.postMessage({
        id: req.id,
        ok: false,
        error: { code: known ? e.code : 'internal', message: known ? e.message : 'Не удалось выполнить действие. Попробуйте ещё раз.' },
      });
    }
  });
};
