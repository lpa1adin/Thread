/**
 * Алгоритмы на графе в памяти: объединение связей и ссылок, обход, цепочка изучения.
 * Правила создания связей (F4) сосредоточены в buildEdges и покрыты unit-тестами.
 */
import { REL } from './constants';
import type { Edge, LinkRow, Relation, RelationType } from './types';

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Граф = relations ∪ links без дублей:
 *  - направленная связь уникальна по (источник, цель, тип), ненаправленная — по паре страниц и типу;
 *  - ссылка без типа считается «связано с» и отбрасывается, если между этими страницами
 *    уже есть типизированная связь.
 */
export function buildEdges(relations: Relation[], links: LinkRow[], types: RelationType[]): Edge[] {
  const directed = new Map(types.map((t) => [t.id, t.directed]));
  const edges: Edge[] = [];
  const keys = new Set<string>();
  const pairs = new Set<string>();
  const push = (e: Edge) => {
    if (e.source === e.target || !directed.has(e.typeId)) return;
    const key = directed.get(e.typeId) ? `${e.source}|${e.target}|${e.typeId}` : `${pairKey(e.source, e.target)}|${e.typeId}`;
    if (keys.has(key)) return;
    keys.add(key);
    pairs.add(pairKey(e.source, e.target));
    edges.push(e);
  };
  for (const r of relations) {
    if (!r.deleted) push({ id: r.id, source: r.sourceId, target: r.targetId, typeId: r.typeId, origin: 'manual' });
  }
  const untyped: Edge[] = [];
  links.forEach((l, i) => {
    const e: Edge = {
      id: `t${i}:${l.originKind}:${l.originId}:${l.sourceId}:${l.targetId}:${l.typeId ?? ''}`,
      source: l.sourceId,
      target: l.targetId,
      typeId: l.typeId ?? REL.related,
      origin: 'text',
      originKind: l.originKind,
      originId: l.originId,
    };
    if (l.typeId && l.typeId !== REL.related) push(e);
    else untyped.push(e);
  });
  for (const e of untyped) if (!pairs.has(pairKey(e.source, e.target))) push(e);
  return edges;
}

export type Adjacency = Map<string, { id: string; edge: Edge }[]>;

export function adjacency(edges: Edge[]): Adjacency {
  const adj: Adjacency = new Map();
  const add = (a: string, b: string, edge: Edge) => {
    let list = adj.get(a);
    if (!list) adj.set(a, (list = []));
    list.push({ id: b, edge });
  };
  for (const e of edges) {
    add(e.source, e.target, e);
    add(e.target, e.source, e);
  }
  return adj;
}

/** Обход в ширину: расстояния от узла до соседей на глубину не более maxDepth (0 — без ограничения). */
export function bfsDepths(adj: Adjacency, start: string, maxDepth = 0): Map<string, number> {
  const depth = new Map([[start, 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i];
    const d = depth.get(v)!;
    if (maxDepth && d >= maxDepth) continue;
    for (const { id } of adj.get(v) ?? []) {
      if (!depth.has(id)) {
        depth.set(id, d + 1);
        queue.push(id);
      }
    }
  }
  return depth;
}

/** Кратчайший путь между двумя страницами (BFS) — список узлов или null. */
export function shortestPath(adj: Adjacency, from: string, to: string): string[] | null {
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i];
    if (v === to) break;
    for (const { id } of adj.get(v) ?? []) {
      if (!prev.has(id)) {
        prev.set(id, v);
        queue.push(id);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path: string[] = [];
  for (let v: string | null = to; v !== null; v = prev.get(v) ?? null) path.unshift(v);
  return path;
}

/**
 * «Перед этим стоит изучить» (F10): топологическая сортировка по связям «требует знания».
 * Возвращает порядок изучения (сначала самое базовое) без самой страницы и признак цикла.
 */
export function prerequisites(id: string, edges: Edge[]): { order: string[]; cycle: boolean } {
  const req = new Map<string, string[]>();
  for (const e of edges) {
    if (e.typeId !== REL.requires) continue;
    let list = req.get(e.source);
    if (!list) req.set(e.source, (list = []));
    list.push(e.target);
  }
  const state = new Map<string, 1 | 2>();
  const order: string[] = [];
  let cycle = false;
  // Обход без рекурсии: цепочки бывают длинными.
  const stack: { v: string; i: number }[] = [{ v: id, i: 0 }];
  state.set(id, 1);
  while (stack.length) {
    const top = stack[stack.length - 1];
    const next = req.get(top.v) ?? [];
    if (top.i < next.length) {
      const u = next[top.i++];
      const s = state.get(u);
      if (s === 1) cycle = true;
      else if (!s) {
        state.set(u, 1);
        stack.push({ v: u, i: 0 });
      }
    } else {
      state.set(top.v, 2);
      order.push(top.v);
      stack.pop();
    }
  }
  return { order: order.filter((x) => x !== id), cycle };
}

/** Строка навигации «является частью»: уровни от дальнего предка к прямым родителям. */
export function partOfLevels(id: string, edges: Edge[], maxLevels = 5): string[][] {
  const parents = new Map<string, string[]>();
  for (const e of edges) {
    if (e.typeId !== REL.partOf) continue;
    let list = parents.get(e.source);
    if (!list) parents.set(e.source, (list = []));
    if (!list.includes(e.target)) list.push(e.target);
  }
  const levels: string[][] = [];
  const seen = new Set([id]);
  let current = id;
  for (let i = 0; i < maxLevels; i++) {
    const ps = (parents.get(current) ?? []).filter((p) => !seen.has(p));
    if (!ps.length) break;
    // На ближайшем уровне показываем всех родителей, выше идём по первому.
    levels.unshift(i === 0 ? ps : [ps[0]]);
    ps.forEach((p) => seen.add(p));
    current = ps[0];
  }
  return levels;
}

export function isolatedIds(ids: string[], edges: Edge[]): string[] {
  const linked = new Set<string>();
  for (const e of edges) {
    linked.add(e.source);
    linked.add(e.target);
  }
  return ids.filter((id) => !linked.has(id));
}
