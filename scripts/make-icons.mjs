// Рисует PNG-значки PWA из одного SVG. Запуск: npm run icons
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
const glyph = `<g fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"><path d="M32 18v12M32 30H19v10M32 30h13v10"/></g>
<circle cx="32" cy="16" r="6" fill="#f5b400"/><circle cx="19" cy="44" r="5.5" fill="#fff"/><circle cx="45" cy="44" r="5.5" fill="#fff"/>`;
// maskable: фон во весь квадрат, рисунок в «безопасной зоне» (система сама обрежет углы).
const svg = (size, maskable) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
<rect width="64" height="64" rx="${maskable ? 0 : 14}" fill="#534ab7"/><g transform="${maskable ? 'translate(32 32) scale(0.72) translate(-32 -32)' : ''}">${glyph}</g></svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${svg(size, maskable)}</body>`);
  await page.screenshot({ path: out(name), omitBackground: true });
}
await browser.close();
