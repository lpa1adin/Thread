/**
 * Послойная раскладка дерева изучения (алгоритм Сугиямы), собственная реализация:
 *  1) разрыв циклов обходом в глубину; 2) распределение по слоям (самый длинный путь);
 *  3) фиктивные узлы для рёбер через несколько слоёв; 4) уменьшение пересечений (барицентры);
 *  5) координаты и прямоугольные соединители.
 * Чистая функция: используется картой, экспортом и экспериментами (число пересечений, время).
 */

export interface LayoutNode {
  id: string;
  w: number;
  h: number;
  /** Порядок по умолчанию внутри слоя (название страницы). */
  sortKey: string;
}

export interface LayoutEdge {
  from: string;
  to: string;
  type: string;
}

export interface LayoutOptions {
  gapX?: number;
  gapY?: number;
  pad?: number;
  /** Число проходов уменьшения пересечений. */
  sweeps?: number;
}

export interface PlacedNode {
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
}

export interface PlacedEdge extends LayoutEdge {
  /** Путь SVG из вертикальных и горизонтальных отрезков. */
  path: string;
}

export interface LayoutResult {
  nodes: Map<string, PlacedNode>;
  edges: PlacedEdge[];
  layers: string[][];
  width: number;
  height: number;
  crossings: number;
  /** Сколько рёбер отброшено при разрыве циклов. */
  removedEdges: number;
}

const DUMMY_W = 14;

/** Число пересечений между двумя соседними слоями: инверсии в порядке нижних концов (дерево Фенвика). */
function countCrossings(pairs: [number, number][], lowerSize: number): number {
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const tree = new Int32Array(lowerSize + 1);
  let res = 0;
  let seen = 0;
  for (const [, low] of pairs) {
    let sum = 0;
    for (let i = low + 1; i > 0; i -= i & -i) sum += tree[i];
    res += seen - sum;
    for (let i = low + 1; i <= lowerSize; i += i & -i) tree[i]++;
    seen++;
  }
  return res;
}

export function layoutLayers(nodesIn: LayoutNode[], edgesIn: LayoutEdge[], opts: LayoutOptions = {}): LayoutResult {
  const gapX = opts.gapX ?? 34;
  const gapY = opts.gapY ?? 64;
  const pad = opts.pad ?? 40;
  const size = new Map(nodesIn.map((n) => [n.id, n]));

  // --- рёбра: только между известными узлами, без петель и повторов
  const seen = new Set<string>();
  let edges = edgesIn.filter((e) => {
    const k = `${e.from}>${e.to}`;
    if (e.from === e.to || !size.has(e.from) || !size.has(e.to) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const total = edges.length;

  // --- 1. разрыв циклов: ребро в узел, который сейчас «в обходе», отбрасывается
  const out = new Map<string, LayoutEdge[]>(nodesIn.map((n) => [n.id, []]));
  const indeg = new Map<string, number>(nodesIn.map((n) => [n.id, 0]));
  for (const e of edges) {
    out.get(e.from)!.push(e);
    indeg.set(e.to, indeg.get(e.to)! + 1);
  }
  const order = [...nodesIn].sort((a, b) => indeg.get(a.id)! - indeg.get(b.id)! || a.sortKey.localeCompare(b.sortKey, 'ru'));
  const state = new Map<string, 1 | 2>();
  const kept: LayoutEdge[] = [];
  for (const root of order) {
    if (state.has(root.id)) continue;
    const stack = [{ v: root.id, i: 0 }];
    state.set(root.id, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const list = out.get(top.v)!;
      if (top.i < list.length) {
        const e = list[top.i++];
        const s = state.get(e.to);
        if (s === 1) continue;
        kept.push(e);
        if (!s) {
          state.set(e.to, 1);
          stack.push({ v: e.to, i: 0 });
        }
      } else {
        state.set(top.v, 2);
        stack.pop();
      }
    }
  }
  edges = kept;

  // --- 2. слои: самый длинный путь от корней (алгоритм Кана)
  const preds = new Map<string, string[]>(nodesIn.map((n) => [n.id, []]));
  const succs = new Map<string, string[]>(nodesIn.map((n) => [n.id, []]));
  const deg = new Map<string, number>(nodesIn.map((n) => [n.id, 0]));
  for (const e of edges) {
    preds.get(e.to)!.push(e.from);
    succs.get(e.from)!.push(e.to);
    deg.set(e.to, deg.get(e.to)! + 1);
  }
  const layerOf = new Map<string, number>();
  const queue = order.filter((n) => deg.get(n.id) === 0).map((n) => n.id);
  for (let i = 0; i < queue.length; i++) {
    const v = queue[i];
    let l = 0;
    for (const p of preds.get(v)!) l = Math.max(l, layerOf.get(p)! + 1);
    layerOf.set(v, l);
    for (const s of succs.get(v)!) {
      deg.set(s, deg.get(s)! - 1);
      if (deg.get(s) === 0) queue.push(s);
    }
  }

  // --- 3. слои с фиктивными узлами; up/down — соседи в соседних слоях
  const layers: string[][] = [];
  const widthOf = new Map<string, number>();
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  const addNode = (id: string, layer: number, w: number) => {
    (layers[layer] ??= []).push(id);
    widthOf.set(id, w);
    up.set(id, []);
    down.set(id, []);
  };
  for (const n of order) if (layerOf.has(n.id)) addNode(n.id, layerOf.get(n.id)!, n.w);
  for (let i = 0; i < layers.length; i++) layers[i] ??= [];
  const chains: { edge: LayoutEdge; chain: string[] }[] = [];
  let dummy = 0;
  for (const e of edges) {
    const a = layerOf.get(e.from)!;
    const b = layerOf.get(e.to)!;
    const chain = [e.from];
    for (let l = a + 1; l < b; l++) {
      const id = `\u0000d${dummy++}`;
      addNode(id, l, DUMMY_W);
      chain.push(id);
    }
    chain.push(e.to);
    for (let i = 1; i < chain.length; i++) {
      down.get(chain[i - 1])!.push(chain[i]);
      up.get(chain[i])!.push(chain[i - 1]);
    }
    chains.push({ edge: e, chain });
  }

  // --- 4. порядок в слоях: проходы вниз и вверх по барицентрам, лучший вариант запоминается
  const pos = new Map<string, number>();
  const reindex = (layer: string[]) => layer.forEach((id, i) => pos.set(id, i));
  layers.forEach(reindex);
  const crossingsNow = () => {
    let sum = 0;
    for (let l = 1; l < layers.length; l++) {
      const pairs: [number, number][] = [];
      for (const v of layers[l]) for (const u of up.get(v)!) pairs.push([pos.get(u)!, pos.get(v)!]);
      if (pairs.length > 1) sum += countCrossings(pairs, layers[l].length);
    }
    return sum;
  };
  const sortBy = (layer: string[], neigh: Map<string, string[]>) => {
    const key = new Map<string, number>();
    for (const v of layer) {
      const ns = neigh.get(v)!;
      key.set(v, ns.length ? ns.reduce((s, n) => s + pos.get(n)!, 0) / ns.length : pos.get(v)!);
    }
    layer.sort((a, b) => key.get(a)! - key.get(b)! || pos.get(a)! - pos.get(b)!);
    reindex(layer);
  };
  let best = layers.map((l) => [...l]);
  let bestCross = crossingsNow();
  const sweeps = opts.sweeps ?? (widthOf.size > 4000 ? 4 : 12);
  for (let s = 0; s < sweeps && bestCross > 0; s++) {
    if (s % 2 === 0) for (let l = 1; l < layers.length; l++) sortBy(layers[l], up);
    else for (let l = layers.length - 2; l >= 0; l--) sortBy(layers[l], down);
    const c = crossingsNow();
    if (c < bestCross) {
      bestCross = c;
      best = layers.map((l) => [...l]);
    }
  }
  best.forEach((l, i) => {
    layers[i] = l;
    reindex(l);
  });

  // --- 5. координаты: центр узла тянется к среднему центру соседей, порядок и зазоры сохраняются
  const cx = new Map<string, number>();
  for (const layer of layers) {
    let x = 0;
    for (const id of layer) {
      const w = widthOf.get(id)!;
      cx.set(id, x + w / 2);
      x += w + gapX;
    }
  }
  const place = (layer: string[], neigh: Map<string, string[]>) => {
    if (!layer.length) return;
    const want = layer.map((id) => {
      const ns = neigh.get(id)!;
      return ns.length ? ns.reduce((s, n) => s + cx.get(n)!, 0) / ns.length : cx.get(id)!;
    });
    const xs: number[] = [];
    for (let i = 0; i < layer.length; i++) {
      const min = i ? xs[i - 1] + (widthOf.get(layer[i - 1])! + widthOf.get(layer[i])!) / 2 + gapX : -Infinity;
      xs.push(Math.max(want[i], min));
    }
    // Зазоры сдвигают слой вправо — возвращаем его на среднее отклонение.
    const shift = xs.reduce((s, x, j) => s + (x - want[j]), 0) / layer.length;
    layer.forEach((id, i) => cx.set(id, xs[i] - shift));
  };
  for (let it = 0; it < 3; it++) {
    for (let l = 1; l < layers.length; l++) place(layers[l], up);
    for (let l = layers.length - 2; l >= 0; l--) place(layers[l], down);
  }

  let minX = Infinity;
  let maxX = -Infinity;
  for (const [id, x] of cx) {
    const w = widthOf.get(id)!;
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
  }
  if (!cx.size) minX = maxX = 0;
  const layerY: number[] = [];
  const layerH: number[] = [];
  let y = pad;
  layers.forEach((layer, i) => {
    layerY[i] = y;
    layerH[i] = Math.max(0, ...layer.map((id) => size.get(id)?.h ?? 0));
    y += layerH[i] + gapY;
  });

  const nodes = new Map<string, PlacedNode>();
  const layerIndex = new Map<string, number>();
  layers.forEach((layer, i) => {
    for (const id of layer) {
      layerIndex.set(id, i);
      const n = size.get(id);
      if (n) nodes.set(id, { x: cx.get(id)! - n.w / 2 - minX + pad, y: layerY[i], w: n.w, h: n.h, layer: i });
    }
  });
  const center = (id: string) => Math.round(cx.get(id)! - minX + pad);

  const placedEdges: PlacedEdge[] = chains.map(({ edge, chain }) => {
    const first = nodes.get(chain[0])!;
    let path = `M${center(chain[0])} ${first.y + first.h}`;
    for (let i = 1; i < chain.length; i++) {
      const l = layerIndex.get(chain[i])!;
      const channel = layerY[l] - gapY / 2 + 6;
      const isLast = i === chain.length - 1;
      path += ` V${channel} H${center(chain[i])} V${isLast ? layerY[l] - 2 : layerY[l] + layerH[l]}`;
    }
    return { ...edge, path };
  });

  return {
    nodes,
    edges: placedEdges,
    layers: layers.map((l) => l.filter((id) => size.has(id))),
    width: Math.max(0, maxX - minX) + pad * 2,
    height: Math.max(0, y - gapY) + pad,
    crossings: bestCross,
    removedEdges: total - edges.length,
  };
}
