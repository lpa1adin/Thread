/** Модель карты изучения (F15): отбор страниц по фильтру, размеры карточек, раскладка по слоям. */
import { CONCEPT_TYPES, STATUSES } from '../../core/constants';
import { layoutLayers, type LayoutResult } from '../../core/layout';
import type { MapData } from '../../core/types';

export const CARD = { w: 204, h: 34, line: 22, pad: 8 };
export const MARKED_FILTER = '__marked';

type MapNode = MapData['nodes'][number];

export interface MapCard {
  node: MapNode;
  x: number;
  y: number;
  h: number;
  open: boolean;
  info: string;
}

export interface MapModel {
  cards: MapCard[];
  layout: LayoutResult;
  /** Страницы без связей «требует знания» и «является частью» — перечисляются отдельно. */
  unplaced: MapNode[];
  /** Страницы, которые есть на карте (для списка фильтра). */
  onMap: MapNode[];
}

const cardHeight = (n: MapNode, open: boolean) => (open ? CARD.h + (1 + Math.max(1, n.materialTitles.length)) * CARD.line + CARD.pad : CARD.h);

export function buildMapModel(data: MapData, filter: string, open: Set<string>): MapModel {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const edges = data.edges.filter((e) => byId.has(e.from) && byId.has(e.to));
  const all = new Set<string>();
  for (const e of edges) (all.add(e.from), all.add(e.to));
  let ids = all;

  if (filter === MARKED_FILTER) {
    // Отмеченные и всё, что нужно изучить до них.
    const keep = new Set(data.nodes.filter((n) => n.marked).map((n) => n.id));
    const stack = [...keep];
    while (stack.length) {
      const v = stack.pop()!;
      for (const e of edges) {
        if (e.to === v && e.type === 'req' && !keep.has(e.from)) {
          keep.add(e.from);
          stack.push(e.from);
        }
      }
    }
    ids = keep;
  } else if (filter && all.has(filter)) {
    // Ветка страницы: всё, что выше и ниже неё по дереву.
    const keep = new Set([filter]);
    for (const down of [true, false]) {
      const stack = [filter];
      while (stack.length) {
        const v = stack.pop()!;
        for (const e of edges) {
          const [a, b] = down ? [e.from, e.to] : [e.to, e.from];
          if (a === v && !keep.has(b)) {
            keep.add(b);
            stack.push(b);
          }
        }
      }
    }
    ids = keep;
  }

  const nodes = [...ids].map((id) => byId.get(id)!);
  const layout = layoutLayers(
    nodes.map((n) => ({ id: n.id, w: CARD.w, h: cardHeight(n, open.has(n.id)), sortKey: n.title })),
    edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
  );
  const cards: MapCard[] = nodes.map((n) => {
    const p = layout.nodes.get(n.id)!;
    const tasks = n.tasksAll ? ` · пунктов ${n.tasksDone}/${n.tasksAll}` : '';
    return { node: n, x: Math.round(p.x), y: p.y, h: p.h, open: open.has(n.id), info: `${CONCEPT_TYPES[n.type].name} · ${STATUSES[n.status]}${tasks}` };
  });
  const byTitle = (a: MapNode, b: MapNode) => a.title.localeCompare(b.title, 'ru');
  return {
    cards,
    layout,
    unplaced: filter ? [] : data.nodes.filter((n) => !all.has(n.id)).sort(byTitle),
    onMap: data.nodes.filter((n) => all.has(n.id)).sort(byTitle),
  };
}
