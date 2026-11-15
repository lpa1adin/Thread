/** Клиент воркера: api.<сервис>.<метод>(…) → сообщение воркеру → Promise с результатом. */
import { AppError } from '../core/types';
import type { Api } from '../data/engine';

type Reply = { id: number; ok: true; result: unknown; changed: boolean } | { id: number; ok: false; error: { code: string; message: string } };

const worker = new Worker(new URL('../data/worker.ts', import.meta.url), { type: 'module', name: 'kb-database' });
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let nextId = 1;

let version = 0;
const listeners = new Set<() => void>();

/** Номер версии данных: растёт после каждого изменения, по нему экраны перечитывают данные. */
export const dataVersion = {
  get: () => version,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  bump() {
    version++;
    listeners.forEach((fn) => fn());
  },
};

worker.onmessage = (ev: MessageEvent<Reply>) => {
  const msg = ev.data;
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  if (msg.ok) {
    if (msg.changed) dataVersion.bump();
    p.resolve(msg.result);
  } else {
    p.reject(new AppError(msg.error.code, msg.error.message));
  }
};

worker.onerror = () => {
  for (const p of pending.values()) p.reject(new AppError('worker', 'База данных не запустилась. Обновите страницу.'));
  pending.clear();
};

function call(group: string, method: string, args: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, group, method, args });
  });
}

const groups = new Map<string, object>();

export const api = new Proxy({} as Api & { boot: { status(): Promise<{ storage: 'opfs' | 'memory' }> } }, {
  get(_t, group: string) {
    let g = groups.get(group);
    if (!g) {
      g = new Proxy({}, { get: (_g, method: string) => (...args: unknown[]) => call(group, method, args) });
      groups.set(group, g);
    }
    return g;
  },
});

export const errorMessage = (e: unknown) => (e instanceof AppError ? e.message : 'Что-то пошло не так. Попробуйте ещё раз.');
