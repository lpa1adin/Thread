import { describe, expect, it } from 'vitest';
import { RELATION_TYPES } from './constants';
import { adjacency, bfsDepths, buildEdges, isolatedIds, partOfLevels, prerequisites, shortestPath } from './graph';
import type { Edge, LinkRow, Relation } from './types';

const rel = (id: string, sourceId: string, targetId: string, typeId: string): Relation => ({ id, sourceId, targetId, typeId, createdAt: 0, updatedAt: 0 });
const link = (sourceId: string, targetId: string, typeId: string | null = null): LinkRow => ({ sourceId, targetId, typeId, originKind: 'page', originId: sourceId });
const edge = (source: string, target: string, typeId: string): Edge => ({ id: `${source}-${target}-${typeId}`, source, target, typeId, origin: 'manual' });
const key = (e: Edge) => `${e.source}>${e.target}:${e.typeId}:${e.origin}`;

describe('правила создания связей (F4)', () => {
  it('ссылка без типа считается «связано с»', () => {
    expect(buildEdges([], [link('a', 'b')], RELATION_TYPES).map(key)).toEqual(['a>b:rel:text']);
  });

  it('ссылка без типа не дублирует типизированную связь между теми же страницами', () => {
    const edges = buildEdges([rel('r1', 'a', 'b', 'req')], [link('a', 'b'), link('b', 'a')], RELATION_TYPES);
    expect(edges.map(key)).toEqual(['a>b:req:manual']);
  });

  it('типизированная ссылка из текста тоже вытесняет ссылку без типа', () => {
    const edges = buildEdges([], [link('a', 'b'), link('a', 'b', 'uses')], RELATION_TYPES);
    expect(edges.map(key)).toEqual(['a>b:uses:text']);
  });

  it('направленные связи разных направлений и типов различаются', () => {
    const edges = buildEdges([rel('r1', 'a', 'b', 'req'), rel('r2', 'b', 'a', 'req')], [link('a', 'b', 'uses')], RELATION_TYPES);
    expect(edges).toHaveLength(3);
  });

  it('ненаправленная связь не дублируется в обратную сторону', () => {
    const edges = buildEdges([rel('r1', 'a', 'b', 'alt')], [link('b', 'a', 'alt'), link('b', 'a')], RELATION_TYPES);
    expect(edges.map(key)).toEqual(['a>b:alt:manual']);
  });

  it('повтор связи вручную ссылкой в тексте не создаёт второе ребро', () => {
    expect(buildEdges([rel('r1', 'a', 'b', 'req')], [link('a', 'b', 'req')], RELATION_TYPES)).toHaveLength(1);
  });

  it('удалённые связи, петли и неизвестные типы отбрасываются', () => {
    const edges = buildEdges([{ ...rel('r1', 'a', 'b', 'req'), deleted: true }, rel('r2', 'a', 'a', 'req'), rel('r3', 'a', 'b', 'нет')], [], RELATION_TYPES);
    expect(edges).toEqual([]);
  });
});

describe('обход графа', () => {
  const edges = [edge('a', 'b', 'rel'), edge('b', 'c', 'rel'), edge('c', 'd', 'rel'), edge('x', 'y', 'rel')];
  const adj = adjacency(edges);

  it('находит соседей на заданную глубину', () => {
    expect([...bfsDepths(adj, 'a', 2)]).toEqual([['a', 0], ['b', 1], ['c', 2]]);
    expect(bfsDepths(adj, 'a').size).toBe(4);
  });

  it('находит кратчайший путь или его отсутствие', () => {
    expect(shortestPath(adj, 'd', 'a')).toEqual(['d', 'c', 'b', 'a']);
    expect(shortestPath(adj, 'a', 'x')).toBeNull();
  });

  it('находит несвязанные страницы', () => {
    expect(isolatedIds(['a', 'x', 'z'], edges)).toEqual(['z']);
  });
});

describe('цепочка изучения (F10)', () => {
  it('сортирует топологически: сначала самое базовое', () => {
    const edges = [edge('cors', 'sop', 'req'), edge('sop', 'http', 'req'), edge('cors', 'http', 'req'), edge('cors', 'x', 'uses')];
    expect(prerequisites('cors', edges)).toEqual({ order: ['http', 'sop'], cycle: false });
  });

  it('сообщает о цикле и не зависает', () => {
    const res = prerequisites('a', [edge('a', 'b', 'req'), edge('b', 'c', 'req'), edge('c', 'a', 'req')]);
    expect(res.cycle).toBe(true);
    expect(res.order).toEqual(['c', 'b']);
  });

  it('пустая цепочка, если требований нет', () => {
    expect(prerequisites('a', [edge('a', 'b', 'part')])).toEqual({ order: [], cycle: false });
  });

  it('строит строку навигации «является частью»', () => {
    const edges = [edge('flex', 'css', 'part'), edge('css', 'web', 'part'), edge('css', 'design', 'part'), edge('web', 'it', 'part')];
    expect(partOfLevels('flex', edges)).toEqual([['it'], ['web'], ['css']]);
    expect(partOfLevels('css', edges)).toEqual([['it'], ['web', 'design']]);
    expect(partOfLevels('a', [edge('a', 'b', 'part'), edge('b', 'a', 'part')])).toEqual([['b']]);
  });
});
