import { expect, nav, openDemo, openPage, test, typeInEditor } from './helpers';

test('первый запуск: пустая база, демо-пример, страница со связями', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Нить', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Посмотреть на примере' }).click();
  await expect(page.getByText('15 страниц · 4 материала')).toBeVisible();

  await openPage(page, 'CORS');
  await expect(page.getByText('Перед этим стоит изучить:')).toContainText('HTTP → Same-origin policy → CORS');
  await expect(page.getByRole('heading', { name: 'Материалы (1)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Упоминается на других страницах \(2\)/ })).toBeVisible();
  const side = page.getByRole('complementary', { name: 'Связи страницы' });
  await expect(side.getByRole('heading', { name: 'Связи (4)' })).toBeVisible();
  await expect(side.getByText('требует знания →').first()).toBeVisible();
});

test('создание страницы, ссылки в тексте, автодополнение и переименование (F1–F6)', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Страница', exact: true }).click();
  await page.getByLabel('Название').fill('DNS');
  await page.getByRole('button', { name: 'Создать страницу' }).click();

  await typeInEditor(page, 'Текст страницы', 'Система имён. Работает поверх [[HTT');
  await page.getByRole('option', { name: 'HTTP', exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' и [[Резолвер|требует знания]].');
  await expect(page.getByLabel('Предпросмотр').getByRole('link', { name: 'HTTP' })).toBeVisible();
  await expect(page.getByText('Страниц ещё нет: Резолвер')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
  await page.getByRole('button', { name: 'Готово' }).click();

  // Ссылка на несуществующую страницу создала её; связи появились на панели.
  await expect(page.getByText('Создана страница «Резолвер»')).toBeVisible();
  await expect(page.getByText('Перед этим стоит изучить:')).toContainText('Резолвер → DNS');
  const side = page.getByRole('complementary', { name: 'Связи страницы' });
  await expect(side.getByRole('link', { name: 'HTTP' })).toBeVisible();
  await expect(side.getByRole('link', { name: 'Резолвер' })).toBeVisible();

  // Переименование обновляет ссылки в других текстах.
  await openPage(page, 'Резолвер');
  await page.getByRole('link', { name: 'Редактировать' }).click();
  await page.getByLabel('Название страницы').fill('DNS-резолвер');
  await page.getByLabel('Название страницы').press('Enter');
  await expect(nav(page).getByRole('link', { name: 'DNS-резолвер' })).toBeVisible();
  await page.getByRole('button', { name: 'Готово' }).click();
  await openPage(page, 'DNS');
  await expect(page.locator('.md--article').getByRole('link', { name: 'DNS-резолвер' })).toBeVisible();

  // Удаление: подтверждение, ссылка становится «пустой».
  await openPage(page, 'DNS-резолвер');
  await page.getByRole('link', { name: 'Редактировать' }).click();
  await page.getByRole('button', { name: 'Удалить страницу' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить страницу' }).click();
  await expect(nav(page).getByRole('link', { name: 'DNS-резолвер' })).toHaveCount(0);
  await openPage(page, 'DNS');
  await expect(page.locator('.md--article .wikilink--missing')).toHaveText('DNS-резолвер');
});

test('отметки и статус сохраняются после перезагрузки (F19, надёжность)', async ({ page }) => {
  await openDemo(page);
  await openPage(page, 'Веб-разработка');
  const boxes = page.locator('.md--article').getByRole('checkbox');
  await expect(boxes).toHaveCount(5);
  await expect(boxes.nth(2)).toHaveAttribute('aria-checked', 'false');
  await boxes.nth(2).click();
  await page.getByLabel('Статус изучения').selectOption('done');
  await page.getByRole('button', { name: 'Отметить как интересующее' }).click();
  await expect(page.getByText('Добавлено в отметенные').or(page.getByText('Добавлено в отмеченные'))).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Веб-разработка', level: 1 })).toBeVisible();
  await expect(page.locator('.md--article').getByRole('checkbox').nth(2)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Статус изучения')).toHaveValue('done');
  await page.getByRole('link', { name: 'Отмеченные' }).click();
  await expect(page.getByRole('main').getByRole('link', { name: /Веб-разработка/ })).toBeVisible();
});

test('кнопка «Связать»: тип вопросом, запрет дублей и связи с собой (F5)', async ({ page }) => {
  await openDemo(page);
  await openPage(page, 'WebSocket');
  const side = page.getByRole('complementary', { name: 'Связи страницы' });
  await side.getByRole('button', { name: 'Связать' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Эта страница его использует/ }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Сначала укажите страницу');
  await dialog.getByLabel('С какой страницей').fill('JavaSc');
  await dialog.getByRole('option', { name: 'JavaScript' }).click();
  await dialog.getByRole('button', { name: /Эта страница его использует/ }).click();
  await expect(side.getByText('использует →')).toBeVisible();

  await side.getByRole('button', { name: 'Связать' }).click();
  await dialog.getByLabel('С какой страницей').fill('JavaScript');
  await dialog.getByRole('button', { name: /Эта страница его использует/ }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Такая связь уже есть');
  await dialog.getByLabel('С какой страницей').fill('websocket');
  await dialog.getByRole('button', { name: /Не знаю/ }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Нельзя связать страницу саму с собой');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await side.getByRole('button', { name: 'Удалить связь с «JavaScript»' }).click();
  await expect(side.getByText('использует →')).toHaveCount(0);
});

test('неявные упоминания становятся ссылками только после подтверждения (F11)', async ({ page }) => {
  await openDemo(page);
  await openPage(page, 'JS-фреймворк');
  const side = page.getByRole('complementary', { name: 'Связи страницы' });
  await expect(side.locator('.callout')).toContainText('В тексте упоминаются страницы: React');
  await expect(side.getByRole('heading', { name: 'Связи (1)' })).toBeVisible();
  await side.getByRole('button', { name: 'Сделать ссылками' }).click();
  await expect(page.locator('.md--article').getByRole('link', { name: 'React' })).toBeVisible();
  await expect(side.getByText('В тексте упоминаются страницы:')).toHaveCount(0);
});

test('история «назад / вперёд» и переключатель «Чтение / Карта» (F20)', async ({ page }) => {
  await openDemo(page);
  await openPage(page, 'HTTP');
  await openPage(page, 'CSS');
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByRole('heading', { name: 'HTTP', level: 1 })).toBeVisible();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page.getByRole('heading', { name: 'CSS', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Вперёд' })).toBeDisabled();

  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await page.getByRole('link', { name: 'Открыть страницу «React»' }).click();
  await expect(page.getByRole('heading', { name: 'React', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByRole('img', { name: 'Карта изучения' })).toBeVisible();
  // «Чтение» возвращает на последнюю открытую страницу.
  await page.getByRole('button', { name: 'Чтение' }).click();
  await expect(page.getByRole('heading', { name: 'React', level: 1 })).toBeVisible();
});
