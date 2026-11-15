/**
 * Работа с текстом Markdown: ссылки [[Название]] и [[Название|тип]], пункты списков с отметками,
 * неявные упоминания. Чистые функции без доступа к БД и DOM — покрыты unit-тестами.
 */

/** Ключ для сравнения названий без учёта регистра и лишних пробелов. */
export function norm(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
}

/** Название страницы не может содержать символы разметки ссылки. */
export function cleanTitle(s: string): string {
  return s.normalize('NFC').replace(/[[\]|\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface WikiLink {
  title: string;
  /** Текст после черты: тип связи или произвольная подпись. */
  label: string | null;
  start: number;
  end: number;
}

// Сначала пропускаем код (в нём ссылки не действуют), затем ищем ссылки.
const TOKEN = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)|\[\[([^[\]|\n]+?)(?:\|([^[\]\n]*?))?\]\]/g;

export function scanLinks(text: string): WikiLink[] {
  const out: WikiLink[] = [];
  if (!text || !text.includes('[[')) return out;
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(text))) {
    if (m[1] !== undefined) continue;
    const title = cleanTitle(m[2]);
    if (!title) continue;
    const label = m[3] !== undefined && m[3].trim() ? m[3].trim() : null;
    out.push({ title, label, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** Заменяет название в ссылках на странице при переименовании (F6); тип после черты сохраняется. */
export function renameLinks(text: string, oldTitle: string, newTitle: string): string {
  const key = norm(oldTitle);
  const links = scanLinks(text).filter((l) => norm(l.title) === key);
  if (!links.length) return text;
  let res = text;
  for (let i = links.length - 1; i >= 0; i--) {
    const l = links[i];
    res = res.slice(0, l.start) + `[[${newTitle}${l.label ? '|' + l.label : ''}]]` + res.slice(l.end);
  }
  return res;
}

const TASK_LINE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\](?=\s|$)/;

function mapOutsideFences(text: string, fn: (line: string, lineNo: number) => string): string {
  const lines = text.split('\n');
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].match(/^\s*(```|~~~)/);
    if (f) {
      if (!fence) fence = f[1];
      else if (fence === f[1]) fence = null;
      continue;
    }
    if (!fence) lines[i] = fn(lines[i], i + 1);
  }
  return lines.join('\n');
}

/** Переключает отметку пункта списка в строке lineNo (нумерация с 1). */
export function toggleTaskAtLine(text: string, lineNo: number): string {
  return mapOutsideFences(text, (line, n) =>
    n === lineNo ? line.replace(TASK_LINE, (_m, p: string, v: string) => `${p}[${v === ' ' ? 'x' : ' '}]`) : line,
  );
}

export function taskStats(text: string): { all: number; done: number } {
  let all = 0;
  let done = 0;
  if (!text.includes('[')) return { all, done };
  mapOutsideFences(text, (line) => {
    const m = line.match(TASK_LINE);
    if (m) {
      all++;
      if (m[2] !== ' ') done++;
    }
    return line;
  });
  return { all, done };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (title: string, flags: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRe(title).replace(/ /g, '\\s+')})(?=$|[^\\p{L}\\p{N}_])`, flags);

/** Заменяет код и ссылки пробелами той же длины, чтобы позиции в тексте не сдвигались. */
function maskSyntax(text: string): string {
  TOKEN.lastIndex = 0;
  return text.replace(TOKEN, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Неявные упоминания (F11): названия существующих страниц, которые встречаются в тексте без ссылки.
 * Страницы, на которые ссылка уже есть, не предлагаются.
 */
export function findMentions<T extends { id: string; title: string }>(text: string, pages: T[], excludeIds: string[] = []): T[] {
  if (!text.trim()) return [];
  const masked = maskSyntax(text);
  const lower = norm(masked);
  const linked = new Set(scanLinks(text).map((l) => norm(l.title)));
  const exclude = new Set(excludeIds);
  const res: T[] = [];
  for (const p of pages) {
    const key = norm(p.title);
    if (key.length < 2 || exclude.has(p.id) || linked.has(key) || !lower.includes(key)) continue;
    if (wordRe(p.title, 'iu').test(masked)) res.push(p);
  }
  return res;
}

/** Превращает первое упоминание названия в ссылку. Возвращает исходный текст, если упоминаний нет. */
export function linkFirstMention(text: string, title: string): string {
  const m = wordRe(title, 'iu').exec(maskSyntax(text));
  if (!m) return text;
  const start = m.index + m[1].length;
  return text.slice(0, start) + `[[${title}]]` + text.slice(start + m[2].length);
}

/** Строка текста, в которой стоит ссылка на страницу, — фрагмент для раздела «Упоминается» (F8). */
export function linkContext(text: string, title: string, max = 280): string {
  const key = norm(title);
  const link = scanLinks(text).find((l) => norm(l.title) === key);
  if (!link) return '';
  const from = text.lastIndexOf('\n', link.start - 1) + 1;
  let to = text.indexOf('\n', link.end);
  if (to < 0) to = text.length;
  let line = text.slice(from, to).trim();
  if (line.length > max) {
    const pos = link.start - from;
    const a = Math.max(0, pos - Math.floor(max / 2));
    line = (a > 0 ? '…' : '') + line.slice(a, a + max) + (a + max < line.length ? '…' : '');
  }
  return line;
}

/** Текст без разметки — для поискового индекса и коротких описаний. */
export function plainText(md: string): string {
  return md
    .replace(/```[^\n]*\n?/g, ' ')
    .replace(/\[\[([^[\]|\n]+?)(?:\|[^[\]\n]*?)?\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s/gm, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, ' ')
    .replace(/[*_`~]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export function excerpt(md: string, max = 150): string {
  const t = plainText(md).replace(/\n/g, ' ');
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t;
}

/** Название материала по умолчанию — первая непустая строка текста. */
export function defaultTitle(content: string): string {
  const line = plainText(content).split('\n').find((l) => l.trim()) ?? '';
  return line.slice(0, 80).trim() || 'Без названия';
}

/** Заменяет каждую ссылку результатом fn; код не трогает. */
export function replaceLinks(text: string, fn: (link: WikiLink) => string): string {
  const links = scanLinks(text);
  let res = '';
  let pos = 0;
  for (const l of links) {
    res += text.slice(pos, l.start) + fn(l);
    pos = l.end;
  }
  return res + text.slice(pos);
}
