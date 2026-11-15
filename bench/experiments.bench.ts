/**
 * Эксперименты курсового этапа (раздел 10 ТЗ).
 *  1. Обход графа: соседи на N шагов — рекурсивный SQL-запрос против обхода в памяти; путь (BFS) в памяти.
 *  2. Визуализация: время раскладки карты изучения и число пересечений соединителей.
 * Графы 100–10 000 узлов, две плотности; каждое измерение повторяется не менее 10 раз, берётся медиана.
 * Результаты: docs/experiments-results.json и таблицы в docs/EXPERIMENTS.md.
 */
import { writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { expect, test } from 'vitest';
import { RELATION_TYPES } from '../src/core/constants';
import { adjacency, bfsDepths, buildEdges, shortestPath } from '../src/core/graph';
import { layoutLayers } from '../src/core/layout';
import { relationsRepo } from '../src/data/repositories/graph';
import { neighborIds, neighborIdsViaView } from '../src/data/services/graph';
import { createTestEngine, testCtx } from '../src/data/testing';
import { generateGraph, loadGraph, rng } from './generator';

const SIZES = [100, 500, 1000, 2000, 5000, 10000];
const DENSITIES = [1.5, 3];
const REPEATS = 10;
const STARTS = 10;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const round = (x: number) => Math.round(x * 1000) / 1000;

/** Медиана времени одного вызова fn в миллисекундах по REPEATS повторам. */
function measure(fn: () => void): number {
  fn(); // прогрев
  const times: number[] = [];
  for (let i = 0; i < REPEATS; i++) {
    const t = performance.now();
    fn();
    times.push(performance.now() - t);
  }
  return median(times);
}

test('эксперименты: обход графа и раскладка карты', async () => {
  const traversal: Record<string, number | string>[] = [];
  const layout: Record<string, number | string>[] = [];

  for (const density of DENSITIES) {
    for (const nodes of SIZES) {
      const g = generateGraph(nodes, density);
      const { pdb } = await createTestEngine();
      loadGraph(pdb, g);
      const ctx = testCtx(pdb);
      const rand = rng(nodes);
      const starts = Array.from({ length: STARTS }, () => g.ids[Math.floor(rand() * nodes)]);

      let edges = buildEdges(relationsRepo.all(ctx), [], RELATION_TYPES);
      const buildMs = measure(() => {
        edges = buildEdges(relationsRepo.all(ctx), [], RELATION_TYPES);
      });
      let adj = adjacency(edges);
      const adjMs = measure(() => {
        adj = adjacency(edges);
      });

      const row: Record<string, number | string> = { nodes, edges: g.edges.length, density };
      for (const depth of [1, 2, 3]) {
        // Оба способа должны находить одно и то же множество соседей.
        for (const s of starts) expect(neighborIds(ctx, s, depth, 1e9).size).toBe(bfsDepths(adj, s, depth).size);
        const found = median(starts.map((s) => bfsDepths(adj, s, depth).size));
        row[`found_d${depth}`] = found;
        row[`sql_d${depth}_ms`] = round(measure(() => starts.forEach((s) => neighborIds(ctx, s, depth, 1e9))) / STARTS);
        row[`view_d${depth}_ms`] = round(measure(() => starts.forEach((s) => neighborIdsViaView(ctx, s, depth, 1e9))) / STARTS);
        row[`mem_d${depth}_ms`] = round(measure(() => starts.forEach((s) => bfsDepths(adj, s, depth))) / STARTS);
      }
      row.path_mem_ms = round(measure(() => starts.forEach((s, i) => shortestPath(adj, s, starts[(i + 1) % STARTS]))) / STARTS);
      row.load_edges_ms = round(buildMs);
      row.build_adjacency_ms = round(adjMs);
      traversal.push(row);

      const layoutNodes = g.ids.map((id) => ({ id, w: 204, h: 34, sortKey: id }));
      const layoutEdges = g.edges.map(([a, b]) => ({ from: g.ids[b], to: g.ids[a], type: 'req' }));
      let res = layoutLayers(layoutNodes, layoutEdges);
      const noSweeps = layoutLayers(layoutNodes, layoutEdges, { sweeps: 0 });
      const layoutMs = measure(() => {
        res = layoutLayers(layoutNodes, layoutEdges);
      });
      layout.push({
        nodes,
        edges: g.edges.length,
        density,
        layers: res.layers.length,
        layout_ms: round(layoutMs),
        crossings_initial: noSweeps.crossings,
        crossings: res.crossings,
        reduction_pct: noSweeps.crossings ? Math.round((1 - res.crossings / noSweeps.crossings) * 100) : 0,
      });
      pdb.close();
    }
  }

  const env = {
    date: new Date().toISOString().slice(0, 10),
    runtime: `Node.js ${process.version}`,
    os: `${platform()} ${release()} (${arch()})`,
    cpu: cpus()[0]?.model ?? 'неизвестно',
    sqlite: 'SQLite WASM (@sqlite.org/sqlite-wasm), база в памяти',
    repeats: REPEATS,
    starts: STARTS,
  };
  writeFileSync(new URL('../docs/experiments-results.json', import.meta.url), JSON.stringify({ env, traversal, layout }, null, 2) + '\n');

  const table = (rows: Record<string, number | string>[], cols: [string, string][]) =>
    [`| ${cols.map((c) => c[1]).join(' | ')} |`, `| ${cols.map(() => '---:').join(' | ')} |`, ...rows.map((r) => `| ${cols.map((c) => r[c[0]]).join(' | ')} |`)].join('\n');
  const tCols: [string, string][] = [
    ['nodes', 'Узлов'], ['edges', 'Связей'],
    ['found_d1', 'Соседей, 1 шаг'], ['sql_d1_ms', 'SQL по индексам, мс'], ['view_d1_ms', 'SQL через представление, мс'], ['mem_d1_ms', 'Память, мс'],
    ['found_d2', 'Соседей, 2 шага'], ['sql_d2_ms', 'SQL по индексам, мс'], ['view_d2_ms', 'SQL через представление, мс'], ['mem_d2_ms', 'Память, мс'],
    ['found_d3', 'Соседей, 3 шага'], ['sql_d3_ms', 'SQL по индексам, мс'], ['view_d3_ms', 'SQL через представление, мс'], ['mem_d3_ms', 'Память, мс'],
    ['path_mem_ms', 'Путь BFS, мс'], ['load_edges_ms', 'Чтение связей, мс'], ['build_adjacency_ms', 'Списки смежности, мс'],
  ];
  const lCols: [string, string][] = [
    ['nodes', 'Узлов'], ['edges', 'Связей'], ['layers', 'Слоёв'], ['layout_ms', 'Раскладка, мс'],
    ['crossings_initial', 'Пересечений до'], ['crossings', 'Пересечений после'], ['reduction_pct', 'Снижение, %'],
  ];
  const md = DENSITIES.map(
    (d) =>
      `### Плотность ${d} связи на страницу\n\n**Обход графа**\n\n${table(traversal.filter((r) => r.density === d), tCols)}\n\n**Раскладка карты**\n\n${table(layout.filter((r) => r.density === d), lCols)}`,
  ).join('\n\n');
  writeFileSync(new URL('../docs/experiments-tables.md', import.meta.url), `Условия: ${env.runtime}, ${env.os}, ${env.cpu}; ${env.sqlite}; ${env.repeats} повторов, медиана; ${env.starts} случайных стартовых узлов.\n\n${md}\n`);
});
