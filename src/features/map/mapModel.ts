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
  width: number;
  height: number;
  /** Подпись над карточками страниц, у которых пока нет связей «требует знания» и «является частью». */
  looseLabel: { x: number; y: number; text: string } | null;
  /** Все страницы — для списка фильтра «ветка страницы». */
  pages: MapNode[];
}

const GAP_X = 34;
const GAP_Y = 22;
const PAD = 40;

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
  } else if (filter && byId.has(filter)) {
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
  const info = (n: MapNode) => `${CONCEPT_TYPES[n.type].name} · ${STATUSES[n.status]}${n.tasksAll ? ` · пунктов ${n.tasksDone}/${n.tasksAll}` : ''}`;
  const cards: MapCard[] = nodes.map((n) => {
    const p = layout.nodes.get(n.id)!;
    return { node: n, x: Math.round(p.x), y: p.y, h: p.h, open: open.has(n.id), info: info(n) };
  });
  const byTitle = (a: MapNode, b: MapNode) => a.title.localeCompare(b.title, 'ru');

  // Страницы без связей тоже есть на карте: они стоят сеткой под деревом и ждут, пока их свяжут.
  const loose = filter ? [] : data.nodes.filter((n) => !all.has(n.id)).sort(byTitle);
  const hasTree = nodes.length > 0;
  let width = hasTree ? layout.width : 0;
  let height = hasTree ? layout.height : PAD;
  let looseLabel: MapModel['looseLabel'] = null;
  if (loose.length) {
    const cols = Math.max(1, Math.min(loose.length, Math.max(4, Math.floor((width - PAD * 2 + GAP_X) / (CARD.w + GAP_X)))));
    const gridWidth = cols * (CARD.w + GAP_X) - GAP_X + PAD * 2;
    width = Math.max(width, gridWidth);
    let y = height;
    if (hasTree) {
      looseLabel = { x: PAD, y: y + 18, text: 'Пока без связей «требует знания» и «является частью»' };
      y += 34;
    }
    for (let i = 0; i < loose.length; i += cols) {
      const row = loose.slice(i, i + cols);
      const rowH = Math.max(...row.map((n) => cardHeight(n, open.has(n.id))));
      row.forEach((n, j) => cards.push({ node: n, x: PAD + j * (CARD.w + GAP_X), y, h: cardHeight(n, open.has(n.id)), open: open.has(n.id), info: info(n) }));
      y += rowH + GAP_Y;
    }
    height = y - GAP_Y + PAD;
  }
  return { cards, layout, width, height, looseLabel, pages: [...data.nodes].sort(byTitle) };
}
