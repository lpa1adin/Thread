import { readFile } from 'node:fs/promises';
import { expect, nav, openDemo, openPage, test, typeInEditor } from './helpers';

test('входящие: быстрое сохранение, подсказки, разбор (F12)', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Во входящие' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Сохранить во входящие' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Напишите заголовок или текст');
  await dialog.getByLabel('Заголовок', { exact: true }).fill('Статья про кеширование');
  await dialog.getByLabel('Текст или ссылка').fill('Заголовки кеша в протоколе HTTP.\n- [ ] прочитать');
  await dialog.getByRole('button', { name: 'Сохранить во входящие' }).click();

  await nav(page).getByRole('link', { name: /Входящие/ }).click();
  const item = page.getByRole('article').filter({ hasText: 'Статья про кеширование' });
  await expect(item.getByText('Похоже, это относится к:')).toBeVisible();
  await item.getByRole('checkbox').click();
  await item.getByRole('button', { name: 'HTTP', exact: true }).click();
  await expect(item).toHaveCount(0);

  await openPage(page, 'HTTP');
  const mat = page.locator('.mat').filter({ hasText: 'Статья про кеширование' });
  await expect(mat.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');

  // «Сделать отдельной страницей»
  await nav(page).getByRole('link', { name: /Входящие/ }).click();
  await page.getByRole('article').filter({ hasText: 'GraphQL за 20 минут' }).getByRole('button', { name: 'Сделать отдельной страницей' }).click();
  await expect(page.getByRole('heading', { name: 'GraphQL за 20 минут', level: 1 })).toBeVisible();
  await expect(page.locator('.md--article')).toContainText('Ссылка от одногруппника');
  await expect(nav(page).getByRole('link', { name: /Входящие/ })).not.toContainText('2');
});

test('материал: создание со страницы, привязка к нескольким страницам (F7)', async ({ page }) => {
  await openDemo(page);
  await openPage(page, 'CSS');
  await page.getByRole('link', { name: 'Добавить материал' }).click();
  await page.getByLabel('Заголовок материала').fill('Конспект: Grid');
  await typeInEditor(page, 'Текст материала', 'Сетка из строк и колонок.');
  await page.getByLabel('Название страницы').fill('HTML');
  await page.getByRole('option', { name: 'HTML' }).click();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: 'CSS', level: 1 })).toBeVisible();
  await expect(page.locator('.mat').filter({ hasText: 'Конспект: Grid' })).toContainText('Сетка из строк и колонок.');
  await openPage(page, 'HTML');
  await expect(page.locator('.mat').filter({ hasText: 'Конспект: Grid' })).toBeVisible();
});

test('поиск по тексту с фрагментом (F14)', async ({ page }) => {
  await openDemo(page);
  const search = page.getByRole('combobox', { name: 'Поиск по страницам и материалам' });
  await search.fill('идемпот');
  const hit = page.locator('#search-results').getByRole('option').filter({ hasText: 'идемпотентность HTTP-методов' });
  await expect(hit.locator('mark').first()).toHaveText(/идемпотент/i);
  await search.fill('preflight');
  await page.locator('#search-results').getByRole('option').filter({ hasText: 'CORS' }).first().click();
  await expect(page.getByRole('heading', { name: 'CORS', level: 1 })).toBeVisible();
  await search.fill('абракадабра');
  await expect(page.getByText('Ничего не найдено')).toBeVisible();
});

test('карта: уровни, раскрытие карточки, фильтр, экспорт PNG и SVG (F15, F18)', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  const map = page.getByRole('img', { name: 'Карта изучения' });
  // На карте все 15 страниц: и связанные в дерево, и пока без связей (они стоят ниже дерева).
  await expect(map.getByRole('link', { name: /Открыть страницу/ })).toHaveCount(15);
  await expect(map.getByText('Пока без связей')).toBeVisible();
  const bottom = async (title: string) => (await map.getByRole('link', { name: `Открыть страницу «${title}»` }).boundingBox())!.y;
  expect(await bottom('MDN Web Docs')).toBeGreaterThan(await bottom('Курсовая: база знаний'));

  // HTTP выше CORS: сначала учим то, что требуется.
  const y = async (title: string) => (await map.getByRole('link', { name: `Открыть страницу «${title}»` }).boundingBox())!.y;
  expect(await y('HTTP')).toBeLessThan(await y('Same-origin policy'));
  expect(await y('Same-origin policy')).toBeLessThan(await y('CORS'));

  await map.getByRole('button', { name: 'Развернуть «CORS»' }).click();
  await expect(map.getByText('понятие · отложено')).toBeVisible();
  await expect(map.getByText('Конспект: как я чинил ошибку')).toBeVisible();

  await page.getByLabel('Показать:').selectOption({ label: 'отмеченные и что нужно до них' });
  await expect(map.getByRole('link', { name: /Открыть страницу/ })).toHaveCount(3);

  await page.getByRole('button', { name: 'Экспорт картинкой' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('img', { name: 'Предпросмотр карты изучения' })).toBeVisible();
  const [png] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Скачать PNG' }).click()]);
  expect(png.suggestedFilename()).toMatch(/^nit-karta-.*\.png$/);
  expect((await readFile(await png.path())).subarray(1, 4).toString()).toBe('PNG');
  const [svg] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Скачать SVG' }).click()]);
  const text = await readFile(await svg.path(), 'utf8');
  expect(text).toContain('<svg');
  expect(text).toContain('понятие · отложено');
  expect(text).not.toContain('href=');
});

test('резервная копия, восстановление, экспорт и импорт Markdown (F16)', async ({ page }) => {
  await openDemo(page);
  await nav(page).getByRole('link', { name: 'Настройки и данные' }).click();
  const [backup] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Сохранить копию в файл' }).click()]);
  const path = await backup.path();
  expect(JSON.parse(await readFile(path, 'utf8')).concepts).toHaveLength(15);

  const [md] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать все страницы (.md)' }).click()]);
  expect(await readFile(await md.path(), 'utf8')).toContain('# Веб-разработка');

  await page.getByRole('button', { name: 'Удалить все данные' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить всё' }).click();
  await expect(page.getByRole('button', { name: 'Создать первую страницу' })).toBeVisible();

  await nav(page).getByRole('link', { name: 'Настройки и данные' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Восстановить из файла…' }).click()]);
  await chooser.setFiles(path);
  await page.getByRole('dialog').getByRole('button', { name: 'Заменить данные' }).click();
  await expect(page.getByText('15 страниц · 4 материала')).toBeVisible();

  await nav(page).getByRole('link', { name: 'Настройки и данные' }).click();
  const [mdChooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Добавить .md-файлы во входящие…' }).click()]);
  await mdChooser.setFiles({ name: 'zametka.md', mimeType: 'text/markdown', buffer: Buffer.from('# Заметка из файла\n\nТекст про CSS.') });
  await expect(page.getByText('Добавлено во входящие: 1')).toBeVisible();

  // Чужой файл отклоняется, данные остаются.
  const [badChooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Восстановить из файла…' }).click()]);
  await badChooser.setFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"что-то":1}') });
  await page.getByRole('dialog').getByRole('button', { name: 'Заменить данные' }).click();
  await expect(page.getByText(/не похож на резервную копию/)).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'CORS' }).first()).toBeVisible();
});

test('изображения: кнопка, вставка из буфера, показ, просмотр, перезагрузка', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await openDemo(page);
  await openPage(page, 'WebSocket');
  await page.getByRole('link', { name: 'Написать текст' }).click();
  await typeInEditor(page, 'Текст страницы', 'Схема соединения:');

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Добавить изображение' }).click()]);
  await chooser.setFiles({ name: 'схема.png', mimeType: 'image/png', buffer: png });
  const preview = page.getByLabel('Предпросмотр');
  await expect(preview.getByRole('img', { name: 'схема' })).toHaveJSProperty('naturalWidth', 1);

  // Скриншот из буфера обмена.
  await page.getByRole('textbox', { name: 'Текст страницы' }).click();
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    document.querySelector('.cm-content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, png.toString('base64'));
  await expect(preview.getByRole('img', { name: 'Скриншот' })).toHaveJSProperty('naturalWidth', 1);

  // Не изображение отклоняется с понятным сообщением.
  const [bad] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Добавить изображение' }).click()]);
  await bad.setFiles({ name: 'текст.png', mimeType: 'image/png', buffer: Buffer.from('это не картинка') });
  await expect(page.getByText('Это не изображение. Подходят PNG, JPEG, GIF и WebP')).toBeVisible();

  await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
  await page.getByRole('button', { name: 'Готово' }).click();
  const article = page.locator('.md--article');
  await expect(article.getByRole('img')).toHaveCount(2);

  await page.reload();
  await expect(article.getByRole('img', { name: 'схема' })).toHaveJSProperty('naturalWidth', 1);
  await article.getByRole('img', { name: 'схема' }).click();
  const viewer = page.getByRole('dialog', { name: 'схема' });
  await expect(viewer.getByRole('img')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});

test('карта показывает новые страницы сразу, даже без связей', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Создать первую страницу' }).click();
  await page.getByLabel('Название').fill('Язык C');
  await page.getByRole('button', { name: 'Создать страницу' }).click();
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  const map = page.getByRole('img', { name: 'Карта изучения' });
  await expect(map.getByRole('link', { name: 'Открыть страницу «Язык C»' })).toBeVisible();
  await map.getByRole('button', { name: 'Развернуть «Язык C»' }).click();
  await expect(map.getByText('понятие · отложено')).toBeVisible();
});

test('код: подсветка синтаксиса, название языка, копирование', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openDemo(page);
  await openPage(page, 'React');
  const block = page.locator('.md--article .code').first();
  await expect(block.locator('.code__lang')).toHaveText('JSX');
  await expect(block.locator('.hljs-keyword').first()).toHaveText('function');
  await block.getByRole('button', { name: 'Копировать' }).click();
  await expect(block.getByRole('button', { name: 'Скопировано' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('function Hello({ name })');

  // Язык не указан — определяется по содержимому.
  await openPage(page, 'WebSocket');
  await page.getByRole('link', { name: 'Написать текст' }).click();
  await typeInEditor(page, 'Текст страницы', '```\n#include <stdio.h>\nint main() {\nint score = 87;\nif (score >= 100) { printf("ok"); }\nreturn 0;\n}\n```');
  const preview = page.getByLabel('Предпросмотр');
  await expect(preview.locator('.hljs-keyword').first()).toBeVisible();
  await expect(preview.locator('.hljs-string').filter({ hasText: '"ok"' })).toBeVisible();
  await expect(preview.locator('.hljs-meta').first()).toContainText('#include');
});
