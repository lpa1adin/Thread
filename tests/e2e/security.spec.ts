import { expect, nav, openDemo, openPage, test, typeInEditor } from './helpers';

test('мастер-пароль: шифрование, блокировка, неверный пароль, перезагрузка (S1–S3)', async ({ page }) => {
  test.setTimeout(60_000);
  await openDemo(page);
  await nav(page).getByRole('link', { name: 'Настройки и данные' }).click();
  await page.getByRole('button', { name: 'Установить мастер-пароль' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Новый пароль (не короче 8 символов)').fill('короткий');
  await dialog.getByLabel('Новый пароль ещё раз').fill('другой');
  await dialog.getByRole('button', { name: 'Зашифровать базу' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Пароли не совпадают');
  await dialog.getByLabel('Новый пароль (не короче 8 символов)').fill('надёжный пароль');
  await dialog.getByLabel('Новый пароль ещё раз').fill('надёжный пароль');
  await dialog.getByRole('button', { name: 'Зашифровать базу' }).click();
  await expect(page.getByText('База зашифрована')).toBeVisible();

  // Правка после шифрования должна пережить блокировку.
  await openPage(page, 'WebSocket');
  await page.getByRole('link', { name: 'Написать текст' }).click();
  await typeInEditor(page, 'Текст страницы', 'Двусторонний канал связи.');
  await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
  await page.getByRole('button', { name: 'Готово' }).click();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Нить заблокирована' })).toBeVisible();
  await expect(page.getByText('Двусторонний канал связи.')).toHaveCount(0);
  await page.getByLabel('Мастер-пароль').fill('не тот пароль');
  await page.getByRole('button', { name: 'Открыть базу' }).click();
  await expect(page.getByRole('alert')).toHaveText('Неверный пароль');
  await page.getByLabel('Мастер-пароль').fill('надёжный пароль');
  await page.getByRole('button', { name: 'Открыть базу' }).click();
  await expect(page.getByText('Двусторонний канал связи.')).toBeVisible();

  await nav(page).getByRole('link', { name: 'Настройки и данные' }).click();
  await page.getByRole('button', { name: 'Заблокировать сейчас' }).click();
  await expect(page.getByRole('heading', { name: 'Нить заблокирована' })).toBeVisible();
});

test('чужой код из заметки не выполняется (S4, S5)', async ({ page }) => {
  await openDemo(page);
  await page.evaluate(() => ((window as unknown as { hacked: boolean }).hacked = false));
  await page.getByRole('button', { name: 'Во входящие' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Заголовок').fill('<img src=x onerror="window.hacked=true">');
  await dialog
    .getByLabel('Текст или ссылка')
    .fill('<script>window.hacked=true</script>\n<img src=x onerror="window.hacked=true">\n[нажми](javascript:window.hacked=true)\n![x](https://example.com/a.png)\n[[<b onmouseover=window.hacked=true>X</b>]]');
  await dialog.getByRole('button', { name: 'Сохранить во входящие' }).click();
  await nav(page).getByRole('link', { name: /Входящие/ }).click();
  const item = page.getByRole('article').first();
  await expect(item.getByRole('heading')).toHaveText('<img src=x onerror="window.hacked=true">');
  await expect(item.locator('script, img, [onerror], [onmouseover]')).toHaveCount(0);
  await expect(item.locator('a[href^="javascript"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { hacked: boolean }).hacked)).toBe(false);

  // Политика безопасности подключена, а прямой вставке HTML мешают Trusted Types.
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).toContain("require-trusted-types-for 'script'");
  const blocked = await page.evaluate(() => {
    const el = document.createElement('div');
    el.innerHTML = '<img src=x onerror="window.hacked=true">';
    return el.querySelector('[onerror]') === null;
  });
  expect(blocked).toBe(true);
});

test('работа без сети и постоянное хранилище (F17, S7)', async ({ page, context }) => {
  await openDemo(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Service Worker должен успеть положить файлы в кеш.
  await expect.poll(async () => page.evaluate(async () => (await caches.keys()).length), { timeout: 15_000 }).toBeGreaterThan(0);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('15 страниц · 4 материала')).toBeVisible();
  await openPage(page, 'CORS');
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Карта изучения' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Поиск по страницам и материалам' }).fill('flexbox');
  await expect(page.locator('#search-results').getByRole('option').filter({ hasText: 'CSS' })).toBeVisible();
  await context.setOffline(false);

  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifest).toBeTruthy();
});

test('смартфон: панели друг под другом, страницы — отдельной вкладкой (F17)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await openDemo(page);
  const tabs = page.getByRole('navigation', { name: 'Основные разделы' });
  await expect(tabs).toBeVisible();
  await expect(nav(page)).toBeHidden();
  await tabs.getByRole('link', { name: 'Страницы' }).click();
  await nav(page).getByRole('link', { name: 'CORS' }).first().click();
  await expect(page.getByRole('heading', { name: 'CORS', level: 1 })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Связи страницы' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.getByRole('menuitem', { name: 'Новая страница' }).click();
  await expect(page.getByRole('dialog', { name: 'Новая страница' })).toBeVisible();
});
