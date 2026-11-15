import { expect, test as base, type Page } from '@playwright/test';

/** Каждый тест следит за консолью: ошибок и нарушений CSP быть не должно. */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(String(e)));
      await use(errors);
      expect(errors, 'ошибки в консоли браузера').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function openDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Посмотреть на примере' }).click();
  await expect(page.getByRole('heading', { name: 'Обзор', level: 1 })).toBeVisible();
}

export const nav = (page: Page) => page.getByRole('navigation', { name: 'Разделы и страницы' });

export async function openPage(page: Page, title: string) {
  await nav(page).getByRole('link', { name: title, exact: true }).first().click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
}

/** Печатает текст в редактор CodeMirror. */
export async function typeInEditor(page: Page, label: string, text: string) {
  await page.getByRole('textbox', { name: label }).click();
  await page.keyboard.type(text);
}
