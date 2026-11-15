/** Запросы к графу: страница со связями, соседи по глубине, карта изучения, обзор (F8–F10, F13, F15). */
import { LIMITS, REL } from '../../core/constants';
import { buildEdges, isolatedIds, partOfLevels, prerequisites } from '../../core/graph';
import { findMentions, linkContext } from '../../core/text';
import { AppError, type Backlink, type ConceptBrief, type Edge, type MapData, type Neighborhood, type Overview, type PageView } from '../../core/types';
import { cached, type Ctx } from '../context';
import { conceptsRepo, notesRepo } from '../repositories/content';
import { linksRepo, relationsRepo } from '../repositories/graph';
import { briefs } from './concepts';
import { relationTypes } from './indexing';

/** Граф = relations ∪ links без дублей (правила — в core/graph.ts). */
export const graphEdges = (ctx: Ctx): Edge[] =>
  cached(ctx, 'edges', () => buildEdges(relationsRepo.all(ctx), linksRepo.all(ctx), relationTypes(ctx)));

const byTitle = (a: ConceptBrief, b: ConceptBrief) => a.title.localeCompare(b.title, 'ru');

/**
 * Соседи страницы на глубину depth — рекурсивный запрос (recursive CTE).
 * Запрос обращается к таблицам напрямую, а не через представление graph_edges: сквозь UNION
 * SQLite не использует индексы, и время росло линейно с размером базы (см. docs/EXPERIMENTS.md).
 * Тот же запрос в эксперименте сравнивается с обходом в памяти (раздел 10 ТЗ).
 */
export function neighborIds(ctx: Ctx, id: string, depth: number, limit: number): Map<string, number> {
  const rows = ctx.db.all<{ id: string; depth: number }>(
    `WITH RECURSIVE walk (id, depth) AS (
       SELECT ?1, 0
       UNION
       SELECT r.target_id, w.depth + 1 FROM walk w JOIN relations r ON r.source_id = w.id AND r.deleted = 0 WHERE w.depth < ?2
       UNION
       SELECT r.source_id, w.depth + 1 FROM walk w JOIN relations r ON r.target_id = w.id AND r.deleted = 0 WHERE w.depth < ?2
       UNION
       SELECT l.target_id, w.depth + 1 FROM walk w JOIN links l ON l.source_id = w.id WHERE w.depth < ?2
       UNION
       SELECT l.source_id, w.depth + 1 FROM walk w JOIN links l ON l.target_id = w.id WHERE w.depth < ?2
     )
     SELECT id, min(depth) depth FROM walk GROUP BY id ORDER BY depth, id LIMIT ?3`,
    [id, depth, limit],
  );
  return new Map(rows.map((r) => [r.id, r.depth]));
}

/** Прежний вариант запроса — через представление; оставлен для сравнения в эксперименте. */
export function neighborIdsViaView(ctx: Ctx, id: string, depth: number, limit: number): Map<string, number> {
  const rows = ctx.db.all<{ id: string; depth: number }>(
    `WITH RECURSIVE walk (id, depth) AS (
       SELECT ?1, 0
       UNION
       SELECT e.target_id, w.depth + 1 FROM walk w JOIN graph_edges e ON e.source_id = w.id WHERE w.depth < ?2
       UNION
       SELECT e.source_id, w.depth + 1 FROM walk w JOIN graph_edges e ON e.target_id = w.id WHERE w.depth < ?2
     )
     SELECT id, min(depth) depth FROM walk GROUP BY id ORDER BY depth, id LIMIT ?3`,
    [id, depth, limit],
  );
  return new Map(rows.map((r) => [r.id, r.depth]));
}

export const graphService = {
  page(ctx: Ctx, id: string): PageView {
    const concept = conceptsRepo.get(ctx, id);
    if (!concept) throw new AppError('not-found', 'Страница не найдена — возможно, она удалена');
    const all = briefs(ctx);
    const edges = graphEdges(ctx);
    const pick = (ids: string[]) => ids.map((i) => all.get(i)).filter((b): b is ConceptBrief => !!b);

    const pre = prerequisites(id, edges);
    const materials = notesRepo.forConcept(ctx, id);
    const materialIds = new Set(materials.map((m) => m.id));

    const backlinks: Backlink[] = [];
    for (const o of linksRepo.originsOf(ctx, id)) {
      if (o.originKind === 'page') {
        const from = conceptsRepo.get(ctx, o.originId);
        if (from) backlinks.push({ fromKind: 'page', fromId: from.id, fromTitle: from.title, pageId: from.id, snippet: linkContext(from.body, concept.title) });
      } else if (!materialIds.has(o.originId)) {
        const note = notesRepo.get(ctx, o.originId);
        if (note) backlinks.push({ fromKind: 'note', fromId: note.id, fromTitle: note.title, pageId: note.conceptIds[0] ?? null, snippet: linkContext(note.content, concept.title) });
      }
    }
    backlinks.sort((a, b) => a.fromTitle.localeCompare(b.fromTitle, 'ru'));

    const relations = edges
      .filter((e) => e.source === id || e.target === id)
      .map((edge) => ({ edge, other: all.get(edge.source === id ? edge.target : edge.source)!, outgoing: edge.source === id }))
      .filter((r) => r.other)
      .sort((a, b) => a.edge.typeId.localeCompare(b.edge.typeId) || byTitle(a.other, b.other));

    return {
      concept,
      crumbs: partOfLevels(id, edges).map(pick),
      prereq: { order: pick(pre.order), cycle: pre.cycle },
      materials,
      backlinks,
      relations,
      mentions: findMentions(concept.body, conceptsRepo.titles(ctx), [id]).map((p) => ({ id: p.id, title: p.title })),
    };
  },

  /** Маленький граф: соседи страницы по глубине; без id — вся база. Большие графы обрезаются. */
  neighborhood(ctx: Ctx, id: string | null, depth = 1): Neighborhood {
    const all = briefs(ctx);
    const edges = graphEdges(ctx);
    let ids: Set<string>;
    let truncated = false;
    if (id) {
      const found = neighborIds(ctx, id, Math.max(1, Math.min(4, depth)), LIMITS.graphNodes + 1);
      truncated = found.size > LIMITS.graphNodes;
      ids = new Set([...found.keys()].slice(0, LIMITS.graphNodes));
    } else {
      const linked = new Set<string>();
      for (const e of edges) (linked.add(e.source), linked.add(e.target));
      const sorted = [...all.keys()].sort((a, b) => Number(linked.has(b)) - Number(linked.has(a)));
      truncated = sorted.length > LIMITS.graphNodes;
      ids = new Set(sorted.slice(0, LIMITS.graphNodes));
    }
    return {
      nodes: [...ids].map((i) => all.get(i)).filter((b): b is ConceptBrief => !!b),
      edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
      truncated,
    };
  },

  /** F15: карта строится по связям «требует знания» и «является частью». */
  map(ctx: Ctx): MapData {
    const titles = new Map<string, { id: string; title: string }[]>();
    for (const r of ctx.db.all<{ cid: string; id: string; title: string }>(
      `SELECT cn.concept_id cid, n.id, n.title FROM concept_notes cn JOIN notes n ON n.id = cn.note_id
       WHERE n.deleted = 0 AND n.inbox = 0 ORDER BY n.created_at`,
    )) {
      const list = titles.get(r.cid);
      if (list) list.push({ id: r.id, title: r.title });
      else titles.set(r.cid, [{ id: r.id, title: r.title }]);
    }
    return {
      nodes: [...briefs(ctx).values()].map((b) => ({ ...b, materialTitles: titles.get(b.id) ?? [] })),
      edges: graphEdges(ctx)
        .filter((e) => e.typeId === REL.requires || e.typeId === REL.partOf)
        .map((e) => ({ from: e.target, to: e.source, type: e.typeId as 'req' | 'part' })),
    };
  },

  /** F13: что изучается, что отложено, пустые и несвязанные страницы. */
  overview(ctx: Ctx): Overview {
    const all = [...briefs(ctx).values()].sort(byTitle);
    const edges = graphEdges(ctx);
    const isolated = new Set(isolatedIds(all.map((b) => b.id), edges));
    const count = (sql: string) => ctx.db.get<{ n: number }>(sql)!.n;
    return {
      counts: {
        concepts: all.length,
        notes: count('SELECT count(*) n FROM notes WHERE deleted = 0'),
        edges: edges.length,
        inbox: count('SELECT count(*) n FROM notes WHERE deleted = 0 AND inbox = 1'),
      },
      marked: all.filter((b) => b.marked),
      learning: all.filter((b) => b.status === 'learning'),
      later: all.filter((b) => b.status === 'later'),
      empty: all.filter((b) => b.empty),
      isolated: all.filter((b) => isolated.has(b.id)),
    };
  },

};
