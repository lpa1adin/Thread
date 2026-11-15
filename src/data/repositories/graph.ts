/** Репозитории связей, индекса ссылок и справочника типов. */
import type { LinkRow, Relation, RelationType } from '../../core/types';
import type { Ctx } from '../context';

interface RelationRow {
  id: string;
  source_id: string;
  target_id: string;
  type_id: string;
  created_at: number;
  updated_at: number;
  deleted: number;
}

const toRelation = (r: RelationRow): Relation => ({
  id: r.id,
  sourceId: r.source_id,
  targetId: r.target_id,
  typeId: r.type_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.deleted ? { deleted: true } : {}),
});

export const typesRepo = {
  all(ctx: Ctx): RelationType[] {
    return ctx.db
      .all<{ id: string; name: string; question: string; directed: number; color: string; dash: string }>(
        'SELECT id, name, question, directed, color, dash FROM relation_types ORDER BY sort',
      )
      .map((t) => ({ ...t, directed: !!t.directed }));
  },
};

export const relationsRepo = {
  all(ctx: Ctx, includeDeleted = false): Relation[] {
    return ctx.db.all<RelationRow>(`SELECT * FROM relations ${includeDeleted ? '' : 'WHERE deleted = 0'}`).map(toRelation);
  },

  get(ctx: Ctx, id: string, includeDeleted = false): Relation | undefined {
    const r = ctx.db.get<RelationRow>(`SELECT * FROM relations WHERE id = ? ${includeDeleted ? '' : 'AND deleted = 0'}`, [id]);
    return r && toRelation(r);
  },

  between(ctx: Ctx, a: string, b: string, typeId: string): Relation[] {
    return ctx.db
      .all<RelationRow>(
        `SELECT * FROM relations WHERE deleted = 0 AND type_id = ?
         AND ((source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?))`,
        [typeId, a, b, b, a],
      )
      .map(toRelation);
  },

  insert(ctx: Ctx, r: Relation): void {
    ctx.db.run('INSERT INTO relations (id, source_id, target_id, type_id, created_at, updated_at, deleted) VALUES (?,?,?,?,?,?,?)', [
      r.id, r.sourceId, r.targetId, r.typeId, r.createdAt, r.updatedAt, r.deleted ? 1 : 0,
    ]);
    ctx.mark('relation', r.id);
  },

  softDelete(ctx: Ctx, id: string): void {
    ctx.db.run('UPDATE relations SET deleted = 1, updated_at = ? WHERE id = ?', [ctx.now(), id]);
    ctx.mark('relation', id);
  },

  idsOfConcept(ctx: Ctx, conceptId: string): string[] {
    return ctx.db
      .all<{ id: string }>('SELECT id FROM relations WHERE deleted = 0 AND (source_id = ? OR target_id = ?)', [conceptId, conceptId])
      .map((r) => r.id);
  },
};

export const linksRepo = {
  all(ctx: Ctx): LinkRow[] {
    return ctx.db.all<LinkRow>(
      'SELECT source_id sourceId, target_id targetId, type_id typeId, origin_kind originKind, origin_id originId FROM links ORDER BY id',
    );
  },

  /** Откуда ссылаются на страницу: вид и идентификатор текста-источника. */
  originsOf(ctx: Ctx, targetId: string): { originKind: 'page' | 'note'; originId: string }[] {
    return ctx.db.all('SELECT DISTINCT origin_kind originKind, origin_id originId FROM links WHERE target_id = ?', [targetId]);
  },

  replaceOrigin(ctx: Ctx, kind: 'page' | 'note', originId: string, rows: Omit<LinkRow, 'originKind' | 'originId'>[]): void {
    ctx.db.run('DELETE FROM links WHERE origin_kind = ? AND origin_id = ?', [kind, originId]);
    for (const r of rows) {
      ctx.db.run('INSERT INTO links (source_id, target_id, type_id, origin_kind, origin_id) VALUES (?,?,?,?,?)', [
        r.sourceId, r.targetId, r.typeId, kind, originId,
      ]);
    }
  },

  deleteForConcept(ctx: Ctx, conceptId: string): void {
    ctx.db.run(`DELETE FROM links WHERE source_id = ? OR target_id = ? OR (origin_kind = 'page' AND origin_id = ?)`, [
      conceptId, conceptId, conceptId,
    ]);
  },

  clear(ctx: Ctx): void {
    ctx.db.run('DELETE FROM links');
  },
};
