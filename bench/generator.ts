/** Генератор тестовых графов: N страниц и связи заданной плотности (раздел 10 ТЗ). */
import type { Sql } from '../src/data/storage/sql';

/** Детерминированный генератор случайных чисел: эксперимент воспроизводим. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TestGraph {
  ids: string[];
  /** [источник, цель]: источник «требует знания» цели; цель всегда создана раньше — циклов нет. */
  edges: [number, number][];
}

/** density — среднее число связей на страницу. Цели выбираются с перекосом к «старым» узлам, как в реальной базе. */
export function generateGraph(nodes: number, density: number, seed = 1): TestGraph {
  const rand = rng(seed + nodes * 31 + Math.round(density * 100));
  const ids = Array.from({ length: nodes }, (_, i) => `n${String(i).padStart(6, '0')}`);
  const edges: [number, number][] = [];
  const seen = new Set<number>();
  const total = Math.round(nodes * density);
  for (let guard = 0; edges.length < total && guard < total * 20; guard++) {
    const a = 1 + Math.floor(rand() * (nodes - 1));
    const b = Math.floor(rand() ** 1.5 * a);
    const key = a * nodes + b;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([a, b]);
  }
  return { ids, edges };
}

/** Записывает граф прямо в таблицы: так быстрее, чем через сервисы, а схема и индексы те же. */
export function loadGraph(db: Sql, g: TestGraph): void {
  db.tx(() => {
    g.ids.forEach((id, i) =>
      db.run(`INSERT INTO concepts (id, title, title_key, type, status, created_at, updated_at) VALUES (?,?,?,'concept','later',1,1)`, [id, `Страница ${i}`, `страница ${i}`]),
    );
    g.edges.forEach(([a, b], i) =>
      db.run(`INSERT INTO relations (id, source_id, target_id, type_id, created_at, updated_at) VALUES (?,?,?,'req',1,1)`, [`r${i}`, g.ids[a], g.ids[b]]),
    );
  });
}
