import { beforeEach, describe, expect, it } from 'vitest';
import { fromBase64 } from '../core/crypto';
import type { Api } from './engine';
import { neighborIds } from './services/graph';
import { toMatchExpression } from './services/search';
import type { Sql } from './storage/sql';
import { createTestEngine, testCtx } from './testing';

let api: Api;
let pdb: Sql;

beforeEach(async () => {
  ({ api, pdb } = await createTestEngine());
});

const titles = async () => (await api.concepts.list()).map((c) => c.title).sort();
const edgeList = async (id: string) =>
  (await api.graph.page(id)).relations.map((r) => `${r.outgoing ? '→' : '←'} ${r.other.title} [${r.edge.typeId}/${r.edge.origin}]`).sort();

describe('страницы (F1, F3, F6)', () => {
  it('создаёт страницу и запрещает повтор названия без учёта регистра', async () => {
    await api.concepts.create({ title: 'Протокол HTTP', type: 'tech', tags: ['#сеть', 'Сеть', 'web'] });
    expect((await api.concepts.list())[0]).toMatchObject({ title: 'Протокол HTTP', type: 'tech', status: 'later', empty: true });
    await expect(api.concepts.create({ title: '  протокол   http ' })).rejects.toMatchObject({ code: 'duplicate-title' });
    await expect(api.concepts.create({ title: '  ' })).rejects.toMatchObject({ code: 'title-empty' });
    const page = await api.graph.page((await api.concepts.list())[0].id);
    expect(page.concept.tags).toEqual(['web', 'сеть']);
  });

  it('строит связи из ссылок в тексте с типом и без', async () => {
    const http = await api.concepts.create({ title: 'HTTP' });
    await api.concepts.create({ title: 'CORS' });
    const rest = await api.concepts.create({ title: 'REST', body: 'Методы [[http|использует]], см. [[CORS]] и [[CORS|своя подпись]].' });
    expect(await edgeList(rest.id)).toEqual(['→ CORS [rel/text]', '→ HTTP [uses/text]']);
    expect(await edgeList(http.id)).toEqual(['← REST [uses/text]']);
  });

  it('создаёт страницы по ссылкам только при выходе из редактора', async () => {
    const a = await api.concepts.create({ title: 'A' });
    await api.concepts.update(a.id, { body: 'Ссылка на [[Новая]] и [[Старая пустая]].' });
    expect(await titles()).toEqual(['A']);
    expect(await api.concepts.finishEditing(a.id, ['старая пустая'])).toEqual(['Новая']);
    expect(await titles()).toEqual(['A', 'Новая']);
    expect(await edgeList(a.id)).toEqual(['→ Новая [rel/text]']);
  });

  it('пустая ссылка оживает, когда страница появляется', async () => {
    const a = await api.concepts.create({ title: 'A', body: '[[B|требует знания]]' });
    expect(await edgeList(a.id)).toEqual([]);
    await api.concepts.create({ title: 'b' });
    expect(await edgeList(a.id)).toEqual(['→ b [req/text]']);
  });

  it('при переименовании обновляет ссылки во всех текстах', async () => {
    const http = await api.concepts.create({ title: 'HTTP' });
    const a = await api.concepts.create({ title: 'A', body: 'см. [[HTTP|использует]]' });
    const note = await api.notes.save({ title: 'Конспект', content: 'про [[http]]', conceptIds: [a.id] });
    await api.concepts.update(http.id, { title: 'Протокол HTTP' });
    expect((await api.concepts.get(a.id)).body).toBe('см. [[Протокол HTTP|использует]]');
    expect((await api.notes.get(note.id)).content).toBe('про [[Протокол HTTP]]');
    expect(await edgeList(a.id)).toEqual(['→ Протокол HTTP [uses/text]']);
    await expect(api.concepts.update(a.id, { title: 'протокол http' })).rejects.toMatchObject({ code: 'duplicate-title' });
  });

  it('при удалении убирает связи, а ссылки оставляет пустыми', async () => {
    const http = await api.concepts.create({ title: 'HTTP' });
    const a = await api.concepts.create({ title: 'A', body: '[[HTTP]]' });
    await api.relations.create(a.id, { id: http.id }, 'req');
    const note = await api.notes.save({ title: 'Материал', content: 'текст', conceptIds: [http.id] });
    await api.concepts.remove(http.id);
    expect(await titles()).toEqual(['A']);
    expect(await edgeList(a.id)).toEqual([]);
    expect((await api.concepts.get(a.id)).body).toBe('[[HTTP]]');
    expect((await api.notes.get(note.id)).inbox).toBe(true);
    expect(pdb.all('SELECT * FROM links')).toEqual([]);
    // Название освобождается, а пустая ссылка начинает вести на новую страницу.
    await api.concepts.create({ title: 'HTTP' });
    expect(await edgeList(a.id)).toEqual(['→ HTTP [rel/text]']);
  });

  it('переключает отметки в тексте и считает прогресс', async () => {
    const a = await api.concepts.create({ title: 'A', body: '- [ ] раз\n- [x] два' });
    await api.concepts.toggleTask(a.id, 1);
    expect((await api.concepts.list())[0]).toMatchObject({ tasksAll: 2, tasksDone: 2 });
  });
});

describe('связи вручную (F5)', () => {
  it('запрещает дубли и связь с собой, создаёт страницу по названию', async () => {
    const a = await api.concepts.create({ title: 'A' });
    const b = await api.concepts.create({ title: 'B', body: '[[A|использует]]' });
    await api.relations.create(a.id, { id: b.id }, 'req');
    await expect(api.relations.create(a.id, { id: b.id }, 'req')).rejects.toMatchObject({ code: 'duplicate' });
    await expect(api.relations.create(a.id, { title: 'a' }, 'req')).rejects.toMatchObject({ code: 'self-link' });
    // Связь того же типа уже задана ссылкой в тексте.
    await expect(api.relations.create(b.id, { id: a.id }, 'uses')).rejects.toMatchObject({ code: 'duplicate' });
    // Ненаправленная связь — дубль в обе стороны.
    await api.relations.create(a.id, { id: b.id }, 'alt');
    await expect(api.relations.create(b.id, { id: a.id }, 'alt')).rejects.toMatchObject({ code: 'duplicate' });
    // Обратное направление направленной связи — другая связь.
    await api.relations.create(b.id, { id: a.id }, 'req');
    await api.relations.create(a.id, { title: 'Новая' }, 'part');
    expect(await titles()).toEqual(['A', 'B', 'Новая']);
  });

  it('уникальность и целостность проверяются и на уровне БД', async () => {
    const a = await api.concepts.create({ title: 'A' });
    const b = await api.concepts.create({ title: 'B' });
    const ins = (s: string, t: string, id = crypto.randomUUID()) =>
      pdb.run(`INSERT INTO relations (id, source_id, target_id, type_id, created_at, updated_at) VALUES (?,?,?,'req',1,1)`, [id, s, t]);
    ins(a.id, b.id);
    expect(() => ins(a.id, b.id)).toThrow(/UNIQUE/);
    expect(() => ins(a.id, a.id)).toThrow(/CHECK/);
    expect(() => ins(a.id, 'нет-такой')).toThrow(/FOREIGN KEY/);
    expect(() => pdb.run(`INSERT INTO concepts (id, title, title_key, type, status, created_at, updated_at) VALUES ('x','a','a','concept','later',1,1)`)).toThrow(/UNIQUE/);
  });
});

describe('материалы и входящие (F7, F8, F12)', () => {
  it('ссылка в материале даёт связь от всех его страниц, входящие связей не дают', async () => {
    const a = await api.concepts.create({ title: 'A' });
    const b = await api.concepts.create({ title: 'B' });
    const c = await api.concepts.create({ title: 'C' });
    const inbox = await api.notes.save({ title: 'На потом', content: 'про [[C]]' });
    expect(inbox.inbox).toBe(true);
    expect(await edgeList(c.id)).toEqual([]);
    await api.notes.save({ id: inbox.id, title: 'На потом', content: 'про [[C]]', conceptIds: [a.id, b.id] });
    expect(await edgeList(c.id)).toEqual(['← A [rel/text]', '← B [rel/text]']);
    expect((await api.graph.page(a.id)).materials.map((m) => m.title)).toEqual(['На потом']);
  });

  it('показывает обратные ссылки с фрагментом текста', async () => {
    const css = await api.concepts.create({ title: 'CSS' });
    const web = await api.concepts.create({ title: 'Веб', body: 'Начало.\nСтили задаёт [[CSS]].\nКонец.' });
    await api.notes.save({ title: 'Конспект', content: 'Выучить [[css]] к пятнице', conceptIds: [web.id] });
    const back = (await api.graph.page(css.id)).backlinks;
    expect(back.map((b) => [b.fromKind, b.fromTitle, b.snippet])).toEqual([
      ['page', 'Веб', 'Стили задаёт [[CSS]].'],
      ['note', 'Конспект', 'Выучить [[css]] к пятнице'],
    ]);
  });

  it('подсказывает страницы для входящих и разбирает их', async () => {
    const ws = await api.concepts.create({ title: 'WebSocket' });
    await api.concepts.create({ title: 'JavaScript' });
    const n = await api.notes.save({ title: 'Статья: Как работает WebSocket', content: 'Используется из javascript.' });
    const [item] = await api.notes.inbox();
    expect(item.suggestions.map((s) => s.title).sort()).toEqual(['JavaScript', 'WebSocket']);
    await api.notes.attach(n.id, { id: ws.id });
    expect(await api.notes.inbox()).toEqual([]);
    const n2 = await api.notes.save({ title: 'Видео: GraphQL', content: 'текст' });
    const pageId = await api.notes.toPage(n2.id);
    expect(await api.concepts.get(pageId)).toMatchObject({ title: 'GraphQL', body: 'текст' });
    await expect(api.notes.get(n2.id)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('проверяет импортируемые файлы', async () => {
    expect(await api.notes.importMarkdown([{ name: 'a.md', text: '# Заголовок\nтекст' }, { name: 'b.txt', text: 'просто' }])).toBe(2);
    expect((await api.notes.inbox()).map((i) => i.note.title).sort()).toEqual(['b', 'Заголовок']);
    await expect(api.notes.importMarkdown([{ name: 'x.exe', text: '' }])).rejects.toMatchObject({ code: 'import-type' });
    await expect(api.notes.importMarkdown([{ name: 'x.md', text: 'a'.repeat(1024 * 1024 + 1) }])).rejects.toMatchObject({ code: 'import-size' });
    await expect(api.notes.importMarkdown([{ name: 'x.md', text: 'a\u0000b' }])).rejects.toMatchObject({ code: 'import-binary' });
  });
});

describe('запросы к графу (F9, F10, F11, F13, F15)', () => {
  beforeEach(async () => {
    await api.system.loadDemo();
  });
  const id = async (title: string) => (await api.concepts.list()).find((c) => c.title === title)!.id;

  it('демо-база загружается целиком', async () => {
    const o = await api.graph.overview();
    expect(o.counts).toMatchObject({ concepts: 15, notes: 4, inbox: 2 });
    expect(o.empty.map((c) => c.title)).toEqual(['WebSocket']);
    expect(o.learning.length).toBe(5);
  });

  it('цепочка «перед этим стоит изучить» и строка навигации', async () => {
    const cors = await api.graph.page(await id('CORS'));
    expect(cors.prereq.order.map((c) => c.title)).toEqual(['HTTP', 'Same-origin policy']);
    expect(cors.prereq.cycle).toBe(false);
    const css = await api.graph.page(await id('CSS'));
    expect(css.crumbs.map((l) => l.map((c) => c.title))).toEqual([['Веб-разработка']]);
  });

  it('находит неявные упоминания и делает их ссылками после подтверждения', async () => {
    const fw = await id('JS-фреймворк');
    expect((await api.graph.page(fw)).mentions.map((m) => m.title)).toEqual(['React']);
    expect(await api.suggestions.linkMentions('page', fw)).toBe(1);
    const page = await api.graph.page(fw);
    expect(page.concept.body).toContain('[[React]], Angular');
    expect(page.mentions).toEqual([]);
  });

  it('соседи по глубине — рекурсивный запрос', async () => {
    const cors = await id('CORS');
    const n1 = await api.graph.neighborhood(cors, 1);
    expect(n1.nodes.map((n) => n.title).sort()).toEqual(['CORS', 'Fetch API', 'HTTP', 'Same-origin policy', 'Веб-разработка']);
    const n2 = await api.graph.neighborhood(cors, 2);
    expect(n2.nodes.length).toBeGreaterThan(n1.nodes.length);
    const depths = neighborIds(testCtx(pdb), cors, 2, 100);
    expect(depths.get(cors)).toBe(0);
    expect(depths.get(await id('HTTP'))).toBe(1);
    expect(depths.get(await id('REST API'))).toBe(2);
  });

  it('карта строится по «требует знания» и «является частью»', async () => {
    const map = await api.graph.map();
    const title = new Map(map.nodes.map((n) => [n.id, n.title]));
    const edges = map.edges.map((e) => `${title.get(e.from)} → ${title.get(e.to)} (${e.type})`);
    expect(edges).toContain('HTTP → CORS (req)');
    expect(edges).toContain('Веб-разработка → CSS (part)');
    expect(edges).toContain('JavaScript → Fetch API (part)');
    expect(edges.some((e) => e.includes('MDN'))).toBe(false);
  });
});

describe('поиск (F14)', () => {
  beforeEach(async () => {
    await api.system.loadDemo();
  });

  it('ищет по началу слова без учёта регистра и возвращает фрагмент', async () => {
    const hits = await api.search.query('ИДЕМПОТЕНТ');
    expect(hits[0]).toMatchObject({ kind: 'note', title: 'Статья: идемпотентность HTTP-методов', inbox: false });
    expect(hits[0].snippet).toContain('\u0001идемпотентен\u0002');
  });

  it('совпадение в названии выше совпадения в тексте', async () => {
    const hits = await api.search.query('graphql');
    expect(hits[0]).toMatchObject({ kind: 'page', title: 'GraphQL' });
    expect(hits.length).toBeGreaterThan(1);
  });

  it('все слова запроса обязательны; удалённое не находится', async () => {
    expect((await api.search.query('preflight options')).map((h) => h.title)).toEqual(['CORS']);
    expect(await api.search.query('preflight абракадабра')).toEqual([]);
    const cors = (await api.concepts.list()).find((c) => c.title === 'CORS')!;
    await api.concepts.remove(cors.id);
    expect(await api.search.query('preflight')).toEqual([]);
  });

  it('спецсимволы запроса не ломают поиск (S6)', async () => {
    expect(toMatchExpression('"; DROP TABLE concepts; -- http*')).toBe('"drop"* "table"* "concepts"* "http"*');
    expect(toMatchExpression('  ()"* ')).toBeNull();
    expect(await api.search.query('") OR 1=1 --')).toEqual([]);
    expect((await api.concepts.list()).length).toBe(15);
  });
});

describe('резервная копия (F16, S6)', () => {
  it('сохраняет и восстанавливает базу без потерь', async () => {
    await api.system.loadDemo();
    const json = await api.system.exportBackup();
    const before = await api.graph.overview();
    await api.system.clear();
    expect((await api.graph.overview()).counts.concepts).toBe(0);
    expect(await api.system.restoreBackup(json)).toEqual({ concepts: 15, notes: 4 });
    expect((await api.graph.overview()).counts).toEqual(before.counts);
    expect((await api.system.backupInfo()).lastBackupAt).toBeGreaterThan(0);
  });

  it('принимает копию из прототипа', async () => {
    const proto = {
      concepts: [{ id: 'a1', title: 'A', type: 'tech', status: 'done', tags: ['x'], body: '[[B|требует знания]]', marked: true }, { id: 'b1', title: 'B', body: '' }],
      notes: [{ id: 'n1', title: 'Заметка', content: 'т', conceptIds: ['a1', 'нет'], inbox: false, created: 5 }],
      relations: [{ id: 'r1', s: 'a1', t: 'b1', type: 'part' }, { id: 'r2', s: 'a1', t: 'zzz', type: 'part' }],
    };
    await api.system.restoreBackup(JSON.stringify(proto));
    const a = (await api.concepts.list()).find((c) => c.title === 'A')!;
    expect(a).toMatchObject({ type: 'tech', status: 'done', marked: true, materials: 1 });
    expect(await edgeList(a.id)).toEqual(['→ B [part/manual]', '→ B [req/text]']);
  });

  it('отклоняет чужие и повреждённые файлы, не трогая данные', async () => {
    await api.concepts.create({ title: 'Своё' });
    for (const bad of ['не json', '{}', '{"concepts":[{"id":"../x","title":"a"}]}', '{"concepts":[{"id":"a","title":""}]}', '{"concepts":[{"id":"a","title":"t","body":5}]}']) {
      await expect(api.system.restoreBackup(bad)).rejects.toMatchObject({ code: 'bad-backup' });
    }
    expect(await titles()).toEqual(['Своё']);
  });

  it('экспортирует страницы в Markdown', async () => {
    await api.system.loadDemo();
    const md = await api.backup.exportMarkdown();
    expect(md).toContain('# CORS\n\n_тип: понятие · статус: отложено · теги: #безопасность #сеть_');
    expect(md).toContain('## Материал: Конспект: как я чинил ошибку CORS');
    expect(md).toContain('# Входящие');
  });
});

describe('мастер-пароль и шифрование (S1–S3)', () => {
  const plainRows = () => pdb.get<{ n: number }>('SELECT (SELECT count(*) FROM concepts) + (SELECT count(*) FROM notes) + (SELECT count(*) FROM relations) + (SELECT count(*) FROM search) n')!.n;

  it('шифрует данные, блокирует и разблокирует', async () => {
    await api.system.loadDemo();
    await expect(api.security.enable('short')).rejects.toMatchObject({ code: 'weak-password' });
    await api.security.enable('верный пароль');
    expect(plainRows()).toBe(0);
    expect(pdb.get<{ n: number }>('SELECT count(*) n FROM vault')!.n).toBe(15 + 4 + 10);
    const blob = pdb.get<{ data: Uint8Array }>(`SELECT data FROM vault WHERE kind = 'concept' LIMIT 1`)!.data;
    expect(new TextDecoder().decode(blob)).not.toMatch(/title|body/);
    expect((await api.concepts.list()).length).toBe(15);

    await api.security.lock();
    expect(await api.security.status()).toEqual({ enabled: true, unlocked: false });
    await expect(api.concepts.list()).rejects.toMatchObject({ code: 'locked' });
    await expect(api.security.unlock('неверный пароль')).rejects.toMatchObject({ code: 'bad-password' });
    await api.security.unlock('верный пароль');
    expect((await api.graph.overview()).counts).toMatchObject({ concepts: 15, notes: 4 });
    expect((await api.search.query('preflight')).map((h) => h.title)).toEqual(['CORS']);
  });

  it('изменения после включения пароля сохраняются в зашифрованном виде', async () => {
    const a = await api.concepts.create({ title: 'A' });
    await api.security.enable('верный пароль');
    const b = await api.concepts.create({ title: 'Секрет', body: 'тайный текст [[A|требует знания]]' });
    await api.notes.save({ title: 'Материал', content: 'x', conceptIds: [b.id] });
    await api.concepts.remove(a.id);
    expect(plainRows()).toBe(0);
    await api.security.lock();
    await api.security.unlock('верный пароль');
    expect(await titles()).toEqual(['Секрет']);
    expect((await api.graph.page(b.id)).materials.length).toBe(1);

    await api.system.clear();
    expect(pdb.get<{ n: number }>('SELECT count(*) n FROM vault')!.n).toBe(0);
  });

  it('смена и отключение пароля', async () => {
    await api.concepts.create({ title: 'A' });
    await api.security.enable('первый пароль');
    await expect(api.security.changePassword('не тот пароль', 'второй пароль')).rejects.toMatchObject({ code: 'bad-password' });
    await api.security.changePassword('первый пароль', 'второй пароль');
    await api.security.lock();
    await expect(api.security.unlock('первый пароль')).rejects.toMatchObject({ code: 'bad-password' });
    await api.security.unlock('второй пароль');
    await api.security.disable('второй пароль');
    expect(await api.security.status()).toEqual({ enabled: false, unlocked: true });
    expect(pdb.get<{ n: number }>('SELECT count(*) n FROM vault')!.n).toBe(0);
    expect(pdb.get<{ title: string }>('SELECT title FROM concepts')!.title).toBe('A');
  });
});

describe('надёжность', () => {
  it('ошибка внутри операции откатывает все её изменения', async () => {
    const a = await api.concepts.create({ title: 'A' });
    await api.concepts.create({ title: 'B', body: '[[A]]' });
    // Переименование в занятое название: правки ссылок в других текстах не должны остаться.
    await expect(api.concepts.update(a.id, { title: 'b' })).rejects.toThrow();
    expect(await titles()).toEqual(['A', 'B']);
    await expect(api.system.restoreBackup('{"concepts":[{"id":"a","title":"X"},{"id":"a","title":"Y"}]}')).rejects.toThrow();
    expect(await titles()).toEqual(['A', 'B']);
  });

  it('неизвестные операции отклоняются', async () => {
    const { engine } = await createTestEngine();
    await expect(engine.call('concepts', 'constructor', [])).rejects.toMatchObject({ code: 'bad-call' });
    await expect(engine.call('__proto__', 'x', [])).rejects.toMatchObject({ code: 'bad-call' });
  });
});

describe('изображения', () => {
  const PNG = fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
  const count = () => pdb.get<{ n: number }>('SELECT count(*) n FROM attachments')!.n;

  it('сохраняет изображение и определяет тип по содержимому', async () => {
    const { id } = await api.attachments.add({ name: 'снимок.jpg', data: PNG });
    const file = await api.attachments.get(id);
    expect(file.mime).toBe('image/png');
    expect([...file.data]).toEqual([...PNG]);
    await expect(api.attachments.get('нет')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('отклоняет не изображения, пустые и слишком большие файлы', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(api.attachments.add({ name: 'x.png', data: svg })).rejects.toMatchObject({ code: 'image-type' });
    await expect(api.attachments.add({ name: 'x.png', data: new Uint8Array(0) })).rejects.toMatchObject({ code: 'image-empty' });
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PNG);
    await expect(api.attachments.add({ name: 'x.png', data: big })).rejects.toMatchObject({ code: 'image-size' });
    expect(count()).toBe(0);
  });

  it('убирает изображения без ссылок, но не трогает используемые и свежие', async () => {
    const used = await api.attachments.add({ name: 'a.png', data: PNG });
    const inNote = await api.attachments.add({ name: 'b.png', data: PNG });
    await api.attachments.add({ name: 'c.png', data: PNG });
    const page = await api.concepts.create({ title: 'A', body: `![схема](attachment:${used.id})` });
    await api.notes.save({ title: 'М', content: `![x](attachment:${inNote.id})`, conceptIds: [page.id] });
    expect(await api.attachments.sweep()).toBe(0);
    expect(await api.attachments.sweep(0)).toBe(1);
    expect(count()).toBe(2);
    await api.concepts.remove(page.id);
    expect(await api.attachments.sweep(0)).toBe(1);
  });

  it('попадает в резервную копию и восстанавливается из неё', async () => {
    const { id } = await api.attachments.add({ name: 'a.png', data: PNG });
    await api.concepts.create({ title: 'A', body: `![схема](attachment:${id})` });
    const json = await api.system.exportBackup();
    await api.system.clear();
    expect(count()).toBe(0);
    await api.system.restoreBackup(json);
    expect([...(await api.attachments.get(id)).data]).toEqual([...PNG]);
    const fake = JSON.parse(json);
    fake.attachments[0].data = btoa('<script>alert(1)</script>');
    await expect(api.system.restoreBackup(JSON.stringify(fake))).rejects.toMatchObject({ code: 'bad-backup' });
    expect(count()).toBe(1);
  });

  it('шифруется вместе с остальными данными', async () => {
    const { id } = await api.attachments.add({ name: 'a.png', data: PNG });
    await api.security.enable('верный пароль');
    expect(count()).toBe(0);
    const added = await api.attachments.add({ name: 'b.png', data: PNG });
    expect(pdb.get<{ n: number }>(`SELECT count(*) n FROM vault WHERE kind = 'attachment'`)!.n).toBe(2);
    await api.security.lock();
    await expect(api.attachments.get(id)).rejects.toMatchObject({ code: 'locked' });
    await api.security.unlock('верный пароль');
    expect([...(await api.attachments.get(id)).data]).toEqual([...PNG]);
    expect((await api.attachments.get(added.id)).name).toBe('b.png');
    await api.security.disable('верный пароль');
    expect(count()).toBe(2);
  });

  it('старая база получает новую схему без потери данных', async () => {
    pdb.run(`DROP TABLE vault`);
    pdb.run(`CREATE TABLE vault (kind TEXT NOT NULL CHECK (kind IN ('concept','note','relation')), id TEXT NOT NULL, data BLOB NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (kind, id)) WITHOUT ROWID`);
    pdb.run(`INSERT INTO vault VALUES ('concept', 'x', x'00', 1)`);
    const { applySchema } = await import('./storage/schema');
    applySchema(pdb);
    expect(pdb.all('SELECT kind, id FROM vault')).toEqual([{ kind: 'concept', id: 'x' }]);
    pdb.run(`INSERT INTO vault VALUES ('attachment', 'y', x'00', 1)`);
  });
});
