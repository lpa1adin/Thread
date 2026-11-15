import { defineConfig, devices } from '@playwright/test';

/** e2e-тесты идут по собранному приложению: так проверяются и CSP, и Service Worker. */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5210', locale: 'ru-RU', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'npm run build && npx vite preview --port 5210 --strictPort',
    url: 'http://localhost:5210',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
