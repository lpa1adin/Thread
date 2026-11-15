// Строит графики экспериментов (SVG) из docs/experiments-results.json. Запуск: node scripts/make-charts.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const doc = (name) => new URL(`../docs/${name}`, import.meta.url);
const { traversal, layout } = JSON.parse(readFileSync(doc('experiments-results.json'), 'utf8'));

/** Линейный график с логарифмическими осями: размеры графов и времена различаются на порядки. */
function chart({ title, yLabel, series }) {
  const W = 720, H = 400, L = 70, R = 20, T = 50, B = 56;
  const pts = series.flatMap((s) => s.points);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => Math.max(p[1], 1e-4));
  const lx = (v) => Math.log10(v);
  const [x0, x1] = [lx(Math.min(...xs)), lx(Math.max(...xs))];
  const [y0, y1] = [Math.floor(lx(Math.min(...ys))), Math.ceil(lx(Math.max(...ys)))];
  const px = (v) => L + ((lx(v) - x0) / (x1 - x0)) * (W - L - R);
  const py = (v) => H - B - ((lx(Math.max(v, 1e-4)) - y0) / (y1 - y0)) * (H - T - B);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12"><rect width="100%" height="100%" fill="#fff"/>`;
  svg += `<text x="${L}" y="24" font-size="15" font-weight="600">${title}</text>`;
  for (let e = y0; e <= y1; e++) {
    const y = py(10 ** e);
    svg += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#e6e4dd"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" fill="#66645d">${10 ** e >= 1 ? 10 ** e : (10 ** e).toFixed(-e)}</text>`;
  }
  for (const v of [...new Set(xs)]) svg += `<text x="${px(v)}" y="${H - B + 18}" text-anchor="middle" fill="#66645d">${v}</text>`;
  svg += `<text x="${(L + W - R) / 2}" y="${H - 14}" text-anchor="middle" fill="#66645d">Число страниц (узлов графа)</text>`;
  svg += `<text transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" fill="#66645d">${yLabel}</text>`;
  series.forEach((s, i) => {
    svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} points="${s.points.map((p) => `${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(' ')}"/>`;
    for (const p of s.points) svg += `<circle cx="${px(p[0]).toFixed(1)}" cy="${py(p[1]).toFixed(1)}" r="3" fill="${s.color}"/>`;
    const lxp = L + 12 + i * 215;
    svg += `<line x1="${lxp}" x2="${lxp + 22}" y1="${T - 12}" y2="${T - 12}" stroke="${s.color}" stroke-width="2" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/><text x="${lxp + 28}" y="${T - 8}">${s.name}</text>`;
  });
  return svg + '</svg>\n';
}

const by = (rows, density, key) => rows.filter((r) => r.density === density).map((r) => [r.nodes, r[key]]);

writeFileSync(
  doc('chart-traversal.svg'),
  chart({
    title: 'Соседи на 2 шага: время одного запроса (1,5 связи на страницу)',
    yLabel: 'Время, мс (логарифмическая шкала)',
    series: [
      { name: 'SQL через представление', color: '#d85a30', points: by(traversal, 1.5, 'view_d2_ms') },
      { name: 'SQL по индексам', color: '#534ab7', points: by(traversal, 1.5, 'sql_d2_ms') },
      { name: 'Обход в памяти', color: '#1d9e75', dash: '5 4', points: by(traversal, 1.5, 'mem_d2_ms').map(([n, v]) => [n, Math.max(v, 0.0005)]) },
    ],
  }),
);
writeFileSync(
  doc('chart-layout.svg'),
  chart({
    title: 'Раскладка карты изучения: время построения',
    yLabel: 'Время, мс (логарифмическая шкала)',
    series: [
      { name: '1,5 связи на страницу', color: '#534ab7', points: by(layout, 1.5, 'layout_ms') },
      { name: '3 связи на страницу', color: '#d85a30', points: by(layout, 3, 'layout_ms') },
    ],
  }),
);
