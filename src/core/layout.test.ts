import { describe, expect, it } from 'vitest';
import { layoutLayers, type LayoutEdge, type LayoutNode } from './layout';

const nodes = (ids: string[]): LayoutNode[] => ids.map((id) => ({ id, w: 100, h: 30, sortKey: id }));
const e = (from: string, to: string): LayoutEdge => ({ from, to, type: 'req' });

describe('раскладка карты изучения', () => {
  it('ставит то, что учить раньше, выше', () => {
    const r = layoutLayers(nodes(['a', 'b', 'c', 'd']), [e('a', 'b'), e('b', 'c'), e('a', 'd')]);
    expect(r.layers).toEqual([['a'], ['b', 'd'], ['c']]);
    expect(r.nodes.get('a')!.y).toBeLessThan(r.nodes.get('b')!.y);
    expect(r.nodes.get('b')!.y).toBeLessThan(r.nodes.get('c')!.y);
  });

  it('использует самый длинный путь для слоя', () => {
    const r = layoutLayers(nodes(['a', 'b', 'c']), [e('a', 'b'), e('b', 'c'), e('a', 'c')]);
    expect(r.nodes.get('c')!.layer).toBe(2);
    expect(r.edges).toHaveLength(3);
  });

  it('разрывает циклы и сообщает об этом', () => {
    const r = layoutLayers(nodes(['a', 'b', 'c']), [e('a', 'b'), e('b', 'c'), e('c', 'a')]);
    expect(r.removedEdges).toBe(1);
    expect(r.nodes.size).toBe(3);
  });

  it('не накладывает карточки в одном слое', () => {
    const ids = ['r', ...Array.from({ length: 8 }, (_, i) => `n${i}`)];
    const r = layoutLayers(nodes(ids), ids.slice(1).map((id) => e('r', id)), { gapX: 20 });
    const xs = r.layers[1].map((id) => r.nodes.get(id)!.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(120 - 1e-6);
    for (const n of r.nodes.values()) expect(n.x).toBeGreaterThanOrEqual(0);
  });

  it('убирает пересечения, которые можно убрать перестановкой', () => {
    // a→y, b→x: при порядке [a,b] / [x,y] рёбра пересекаются, после сортировки — нет.
    const r = layoutLayers(nodes(['a', 'b', 'x', 'y']), [e('a', 'y'), e('b', 'x')]);
    expect(r.crossings).toBe(0);
  });

  it('игнорирует петли, повторы и рёбра к неизвестным узлам', () => {
    const r = layoutLayers(nodes(['a', 'b']), [e('a', 'a'), e('a', 'b'), e('a', 'b'), e('a', 'zzz')]);
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0].path.startsWith('M')).toBe(true);
  });

  it('пустой граф даёт пустую раскладку', () => {
    const r = layoutLayers([], []);
    expect(r.nodes.size).toBe(0);
    expect(r.crossings).toBe(0);
  });
});
