import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * S4: Content Security Policy и Trusted Types. Подключается только в сборке:
 * в режиме разработки Vite вставляет inline-скрипты для горячей перезагрузки.
 * 'wasm-unsafe-eval' нужен для SQLite и Argon2id (WebAssembly), 'unsafe-inline' в стилях —
 * для редактора CodeMirror, который создаёт стили во время работы.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types default dompurify",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'kb-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

export default defineConfig({
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Нить — база знаний',
        short_name: 'Нить',
        description: 'Персональная база знаний: страницы, связи между ними и карта изучения. Работает без сети.',
        lang: 'ru',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#f6f5f1',
        theme_color: '#534ab7',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  base: './',
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  // assetsInlineLimit: 0 — мелкие шрифты не встраиваются в CSS как data:, иначе их блокирует CSP.
  build: { target: 'es2022', chunkSizeWarningLimit: 1500, assetsInlineLimit: 0 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
