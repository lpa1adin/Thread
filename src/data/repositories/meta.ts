/** Настройки и хранилище зашифрованных объектов. Работают с постоянной БД напрямую. */
import type { VaultKind } from '../context';
import type { Sql } from '../storage/sql';

export const metaRepo = {
  get(db: Sql, key: string): string | undefined {
    return db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])?.value;
  },
  set(db: Sql, key: string, value: string): void {
    db.run('INSERT INTO meta (key, value) VALUES (?,?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, value]);
  },
  remove(db: Sql, key: string): void {
    db.run('DELETE FROM meta WHERE key = ?', [key]);
  },
};

export interface VaultRow {
  kind: VaultKind;
  id: string;
  data: Uint8Array;
}

export const vaultRepo = {
  all(db: Sql): VaultRow[] {
    return db.all<VaultRow>('SELECT kind, id, data FROM vault');
  },
  put(db: Sql, row: VaultRow, now: number): void {
    db.run(
      'INSERT INTO vault (kind, id, data, updated_at) VALUES (?,?,?,?) ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
      [row.kind, row.id, row.data, now],
    );
  },
  remove(db: Sql, kind: VaultKind, id: string): void {
    db.run('DELETE FROM vault WHERE kind = ? AND id = ?', [kind, id]);
  },
  clear(db: Sql): void {
    db.run('DELETE FROM vault');
  },
};
