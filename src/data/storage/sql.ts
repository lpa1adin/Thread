/**
 * Тонкая обёртка над SQLite WASM. Все запросы параметризованные (S6):
 * значения передаются только через bind, а не подстановкой в текст запроса.
 */

type Bind = (string | number | null | Uint8Array)[];

interface RawDb {
  exec(opts: { sql: string; bind?: Bind; rowMode?: 'object'; returnValue?: 'resultRows' }): unknown;
  savepoint<T>(fn: () => T): T;
  close(): void;
}

export class Sql {
  private readonly db: RawDb;

  constructor(db: unknown) {
    this.db = db as RawDb;
  }

  run(sql: string, bind?: Bind): void {
    this.db.exec(bind?.length ? { sql, bind } : { sql });
  }

  all<T>(sql: string, bind?: Bind): T[] {
    return this.db.exec({ sql, ...(bind?.length ? { bind } : {}), rowMode: 'object', returnValue: 'resultRows' }) as T[];
  }

  get<T>(sql: string, bind?: Bind): T | undefined {
    return this.all<T>(sql, bind)[0];
  }

  /** Транзакция (точка сохранения): при ошибке внутри fn все изменения откатываются. */
  tx<T>(fn: () => T): T {
    return this.db.savepoint(fn);
  }

  close(): void {
    this.db.close();
  }
}
