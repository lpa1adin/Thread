/**
 * Движок базы: выполняет операции сервисов в транзакциях, ведёт шифрованное хранилище (S1–S3)
 * и отметки о резервной копии. Не зависит от браузера — в тестах работает с базой в памяти.
 */
import { decryptText, deriveKey, encryptText, fromBase64, newKdfParams, toBase64, type KdfParams } from '../core/crypto';
import { AppError, type BackupInfo, type DataSet, type SecurityStatus } from '../core/types';
import type { Ctx, VaultKind } from './context';
import { demoData } from './demo';
import { handlers } from './handlers';
import { attachmentsRepo } from './repositories/attachments';
import { conceptsRepo, notesRepo } from './repositories/content';
import { attachmentsService } from './services/attachments';
import { relationsRepo } from './repositories/graph';
import { metaRepo, vaultRepo, type VaultRow } from './repositories/meta';
import { backupService } from './services/backup';
import { applySchema, DATA_TABLES } from './storage/schema';
import type { Sql } from './storage/sql';

interface EncMeta {
  kdf: KdfParams;
  /** Зашифрованная контрольная строка: по ней проверяется пароль. */
  check: string;
}

const CHECK_TEXT = 'kb-check-v1';
const MIN_PASSWORD = 8;

export class Engine {
  /** Рабочая БД: постоянная, а при включённом пароле — расшифрованная копия в памяти. null — заблокировано. */
  private db: Sql | null;
  private key: CryptoKey | null = null;
  private dirty = new Set<string>();
  private cache = new Map<string, unknown>();
  private version = 0;

  constructor(
    private readonly pdb: Sql,
    private readonly makeMemoryDb: () => Sql,
  ) {
    pdb.run('PRAGMA secure_delete = ON');
    applySchema(pdb);
    this.db = this.encMeta() ? null : pdb;
  }

  private encMeta(): EncMeta | null {
    const raw = metaRepo.get(this.pdb, 'enc');
    return raw ? (JSON.parse(raw) as EncMeta) : null;
  }

  private ctxFor(db: Sql, track: boolean): Ctx {
    return {
      db,
      now: () => Date.now(),
      uuid: () => crypto.randomUUID(),
      mark: (kind, id) => {
        if (track) this.dirty.add(`${kind}:${id}`);
        this.cache.clear();
      },
      cache: this.cache,
    };
  }

  private ctx(): Ctx {
    if (!this.db) throw new AppError('locked', 'База заблокирована — введите пароль');
    return this.ctxFor(this.db, true);
  }

  /** Вызов операции сервиса: одна операция — одна транзакция. Возвращает результат и признак изменения данных. */
  async call(group: string, method: string, args: unknown[]): Promise<{ result: unknown; changed: boolean }> {
    const before = this.version;
    let result: unknown;
    if (group === 'system' || group === 'security') {
      const target = (group === 'system' ? this.system : this.security) as Record<string, (...a: unknown[]) => unknown>;
      if (!Object.hasOwn(target, method)) throw new AppError('bad-call', 'Неизвестная операция');
      result = await target[method](...args);
    } else {
      // Только собственные методы сервисов: имена вроде constructor или __proto__ не должны вызываться.
      const service = Object.hasOwn(handlers, group) ? (handlers as Record<string, Record<string, unknown>>)[group] : undefined;
      const fn = service && Object.hasOwn(service, method) ? service[method] : undefined;
      if (typeof fn !== 'function') throw new AppError('bad-call', 'Неизвестная операция');
      result = await this.write((ctx) => (fn as (ctx: Ctx, ...a: unknown[]) => unknown)(ctx, ...args));
    }
    return { result, changed: this.version !== before };
  }

  private async write<T>(fn: (ctx: Ctx) => T): Promise<T> {
    const ctx = this.ctx();
    let result: T;
    try {
      result = ctx.db.tx(() => fn(ctx));
    } catch (e) {
      this.dirty.clear();
      this.cache.clear();
      throw e;
    }
    await this.commit();
    return result;
  }

  /** После изменений: шифрует затронутые объекты в постоянное хранилище и отмечает время изменения. */
  private async commit(): Promise<void> {
    if (!this.dirty.size) return;
    const keys = [...this.dirty];
    this.dirty.clear();
    if (this.key) await this.flushVault(keys);
    metaRepo.set(this.pdb, 'last_change_at', String(Date.now()));
    this.version++;
  }

  private aggregate(ctx: Ctx, kind: VaultKind, id: string): unknown {
    if (kind === 'concept') return conceptsRepo.get(ctx, id, true);
    if (kind === 'note') return notesRepo.get(ctx, id, true);
    if (kind === 'attachment') return attachmentsRepo.encoded(ctx, id);
    return relationsRepo.get(ctx, id, true);
  }

  private async flushVault(keys: string[]): Promise<void> {
    const ctx = this.ctx();
    const puts: VaultRow[] = [];
    const removes: { kind: VaultKind; id: string }[] = [];
    for (const k of keys) {
      const sep = k.indexOf(':');
      const kind = k.slice(0, sep) as VaultKind;
      const id = k.slice(sep + 1);
      const obj = this.aggregate(ctx, kind, id);
      if (obj) puts.push({ kind, id, data: await encryptText(this.key!, JSON.stringify(obj), k) });
      else removes.push({ kind, id });
    }
    const now = Date.now();
    this.pdb.tx(() => {
      for (const p of puts) vaultRepo.put(this.pdb, p, now);
      for (const r of removes) vaultRepo.remove(this.pdb, r.kind, r.id);
    });
  }

  private async encryptAll(key: CryptoKey, data: DataSet): Promise<VaultRow[]> {
    const rows: VaultRow[] = [];
    const add = async (kind: VaultKind, items: { id: string }[]) => {
      for (const o of items) rows.push({ kind, id: o.id, data: await encryptText(key, JSON.stringify(o), `${kind}:${o.id}`) });
    };
    await add('concept', data.concepts);
    await add('note', data.notes);
    await add('relation', data.relations);
    await add('attachment', data.attachments);
    return rows;
  }

  private async verify(password: string): Promise<{ key: CryptoKey; meta: EncMeta }> {
    const meta = this.encMeta();
    if (!meta) throw new AppError('not-enabled', 'Пароль не установлен');
    const key = await deriveKey(String(password), meta.kdf);
    try {
      if ((await decryptText(key, fromBase64(meta.check), 'check')) !== CHECK_TEXT) throw new Error('mismatch');
    } catch {
      throw new AppError('bad-password', 'Неверный пароль');
    }
    return { key, meta };
  }

  private static checkPassword(password: unknown): string {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      throw new AppError('weak-password', `Пароль должен быть не короче ${MIN_PASSWORD} символов`);
    }
    return password;
  }

  private memoryDbWith(data: DataSet): Sql {
    const mem = this.makeMemoryDb();
    applySchema(mem);
    const ctx = this.ctxFor(mem, false);
    mem.tx(() => backupService.load(ctx, data));
    return mem;
  }

  readonly security = {
    status: (): SecurityStatus => ({ enabled: !!this.encMeta(), unlocked: !!this.db }),

    /** S1–S2: включить мастер-пароль — данные шифруются, открытые таблицы на диске очищаются. */
    enable: async (password: string): Promise<void> => {
      if (this.encMeta()) throw new AppError('already-enabled', 'Пароль уже установлен');
      const pass = Engine.checkPassword(password);
      const data = backupService.exportData(this.ctx(), true);
      const kdf = newKdfParams();
      const key = await deriveKey(pass, kdf);
      const rows = await this.encryptAll(key, data);
      const check = toBase64(await encryptText(key, CHECK_TEXT, 'check'));
      const mem = this.memoryDbWith(data);
      const now = Date.now();
      this.pdb.tx(() => {
        vaultRepo.clear(this.pdb);
        for (const r of rows) vaultRepo.put(this.pdb, r, now);
        for (const t of DATA_TABLES) this.pdb.run(`DELETE FROM ${t}`);
        metaRepo.set(this.pdb, 'enc', JSON.stringify({ kdf, check } satisfies EncMeta));
      });
      // Освобождённые страницы файла перезаписываются, чтобы открытый текст не остался на диске.
      this.pdb.run('VACUUM');
      this.db = mem;
      this.key = key;
      this.cache.clear();
      this.version++;
    },

    unlock: async (password: string): Promise<void> => {
      if (this.db) return;
      const { key } = await this.verify(password);
      const data: DataSet = { concepts: [], notes: [], relations: [], attachments: [] };
      for (const row of vaultRepo.all(this.pdb)) {
        const obj = JSON.parse(await decryptText(key, row.data, `${row.kind}:${row.id}`));
        if (row.kind === 'concept') data.concepts.push(obj);
        else if (row.kind === 'note') data.notes.push(obj);
        else if (row.kind === 'attachment') data.attachments.push(obj);
        else data.relations.push(obj);
      }
      this.db = this.memoryDbWith(data);
      this.key = key;
      this.cache.clear();
      this.version++;
    },

    /** S3: блокировка — расшифрованная копия в памяти и ключ уничтожаются. */
    lock: (): void => {
      if (!this.encMeta() || !this.db) return;
      this.db.close();
      this.db = null;
      this.key = null;
      this.cache.clear();
      this.dirty.clear();
      this.version++;
    },

    disable: async (password: string): Promise<void> => {
      await this.verify(password);
      const mem = this.ctx().db;
      const data = backupService.exportData(this.ctx(), true);
      const ctx = this.ctxFor(this.pdb, false);
      this.pdb.tx(() => {
        backupService.load(ctx, data);
        vaultRepo.clear(this.pdb);
        metaRepo.remove(this.pdb, 'enc');
      });
      mem.close();
      this.db = this.pdb;
      this.key = null;
      this.cache.clear();
      this.version++;
    },

    changePassword: async (oldPassword: string, newPassword: string): Promise<void> => {
      await this.verify(oldPassword);
      const pass = Engine.checkPassword(newPassword);
      const data = backupService.exportData(this.ctx(), true);
      const kdf = newKdfParams();
      const key = await deriveKey(pass, kdf);
      const rows = await this.encryptAll(key, data);
      const check = toBase64(await encryptText(key, CHECK_TEXT, 'check'));
      const now = Date.now();
      this.pdb.tx(() => {
        vaultRepo.clear(this.pdb);
        for (const r of rows) vaultRepo.put(this.pdb, r, now);
        metaRepo.set(this.pdb, 'enc', JSON.stringify({ kdf, check } satisfies EncMeta));
      });
      this.key = key;
    },
  };

  readonly system = {
    isEmpty: (): boolean => !this.ctx().db.get('SELECT 1 x FROM concepts WHERE deleted = 0 LIMIT 1') && !this.ctx().db.get('SELECT 1 x FROM notes WHERE deleted = 0 LIMIT 1'),

    backupInfo: (): BackupInfo => {
      const num = (k: string) => {
        const v = metaRepo.get(this.pdb, k);
        return v ? Number(v) : null;
      };
      return { lastBackupAt: num('last_backup_at'), lastChangeAt: num('last_change_at') };
    },

    /** F16: резервная копия — JSON со всеми страницами, материалами и связями. */
    exportBackup: (): string => {
      const json = JSON.stringify(backupService.exportBackup(this.ctx()), null, 1);
      metaRepo.set(this.pdb, 'last_backup_at', String(Date.now()));
      this.version++;
      return json;
    },

    restoreBackup: (json: string) => this.write((ctx) => backupService.restore(ctx, json)),

    loadDemo: () => this.write((ctx) => backupService.replaceWith(ctx, demoData(ctx.now(), ctx.uuid))),

    clear: () => this.write((ctx) => backupService.wipe(ctx)),

    /** Уборка при запуске: изображения, на которые давно нет ссылок, удаляются. Пока база заблокирована — ничего не делает. */
    sweep: async (): Promise<number> => (this.db ? this.write((ctx) => attachmentsService.sweep(ctx)) : 0),
  };
}

type Promised<F> = F extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never;
type ServiceApi<T> = { [M in keyof T]: T[M] extends (ctx: Ctx, ...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never };

/** Тип клиента для интерфейса: те же операции, но асинхронные и без параметра контекста. */
export type Api = { [G in keyof typeof handlers]: ServiceApi<(typeof handlers)[G]> } & {
  system: { [M in keyof Engine['system']]: Promised<Engine['system'][M]> };
  security: { [M in keyof Engine['security']]: Promised<Engine['security'][M]> };
};
