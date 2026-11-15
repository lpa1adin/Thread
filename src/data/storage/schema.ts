import { RELATION_TYPES } from '../../core/constants';
import type { Sql } from './sql';

/**
 * Схема из раздела 6 ТЗ. Та же структура переносится в PostgreSQL на сервере (ВКР):
 * все id — UUID, у объектов есть updated_at и признак мягкого удаления deleted.
 *
 * Отличия от таблицы в ТЗ:
 *  - title_key / name_key — название в нижнем регистре: сравнение без учёта регистра в SQLite
 *    по умолчанию работает только для латиницы, а названия страниц русские;
 *  - meta — настройки и служебные отметки; vault — зашифрованные объекты (S2).
 */
const DDL = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS vault (
  kind TEXT NOT NULL CHECK (kind IN ('concept','note','relation')),
  id TEXT NOT NULL,
  data BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  title_key TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('topic','concept','tech','project','source')),
  status TEXT NOT NULL CHECK (status IN ('later','learning','done')),
  marked INTEGER NOT NULL DEFAULT 0 CHECK (marked IN (0,1)),
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1))
);
CREATE UNIQUE INDEX IF NOT EXISTS concepts_title_uq ON concepts (title_key) WHERE deleted = 0;

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  inbox INTEGER NOT NULL DEFAULT 0 CHECK (inbox IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1))
);

CREATE TABLE IF NOT EXISTS concept_notes (
  concept_id TEXT NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  PRIMARY KEY (concept_id, note_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS concept_notes_note ON concept_notes (note_id);

CREATE TABLE IF NOT EXISTS relation_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  question TEXT NOT NULL,
  directed INTEGER NOT NULL CHECK (directed IN (0,1)),
  color TEXT NOT NULL,
  dash TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES concepts (id),
  target_id TEXT NOT NULL REFERENCES concepts (id),
  type_id TEXT NOT NULL REFERENCES relation_types (id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1)),
  CHECK (source_id <> target_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS relations_uq ON relations (source_id, target_id, type_id) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS relations_target ON relations (target_id);

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
  type_id TEXT REFERENCES relation_types (id),
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('page','note')),
  origin_id TEXT NOT NULL,
  CHECK (source_id <> target_id)
);
CREATE INDEX IF NOT EXISTS links_source ON links (source_id);
CREATE INDEX IF NOT EXISTS links_target ON links (target_id);
CREATE INDEX IF NOT EXISTS links_origin ON links (origin_kind, origin_id);

CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS concept_tags (
  concept_id TEXT NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (concept_id, tag_id)
) WITHOUT ROWID;

-- Граф для рекурсивных запросов: связи вручную и ссылки из текста, без точных повторов.
CREATE VIEW IF NOT EXISTS graph_edges AS
  SELECT source_id, target_id, type_id FROM relations WHERE deleted = 0
  UNION
  SELECT source_id, target_id, COALESCE(type_id, 'rel') FROM links;

CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5 (
  kind UNINDEXED, ref UNINDEXED, title, body,
  tokenize = 'unicode61 remove_diacritics 2'
);
`;

export const SCHEMA_VERSION = 1;

export function applySchema(db: Sql): void {
  // Вне транзакции: внутри неё SQLite эту настройку игнорирует.
  db.run('PRAGMA foreign_keys = ON');
  db.tx(() => {
    db.run(DDL);
    RELATION_TYPES.forEach((t, i) =>
      db.run(
        `INSERT INTO relation_types (id, name, question, directed, color, dash, sort) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, question = excluded.question,
           directed = excluded.directed, color = excluded.color, dash = excluded.dash, sort = excluded.sort`,
        [t.id, t.name, t.question, t.directed ? 1 : 0, t.color, t.dash, i],
      ),
    );
    db.run(`INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT (key) DO NOTHING`, [String(SCHEMA_VERSION)]);
  });
}

/** Таблицы с данными пользователя — в порядке, безопасном для удаления с учётом внешних ключей. */
export const DATA_TABLES = ['links', 'concept_notes', 'concept_tags', 'relations', 'tags', 'notes', 'concepts', 'search'];
