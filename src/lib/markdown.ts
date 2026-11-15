/**
 * Markdown → безопасный HTML: remark/unified, затем санитизация DOMPurify (S5).
 * Ссылки [[…]] становятся ссылками на страницы, пункты `- [ ]` — круглыми отметками (F19).
 */
import DOMPurify from 'dompurify';
import type { Element, ElementContent, Root } from 'hast';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { norm, replaceLinks } from '../core/text';
import type { RelationType } from '../core/types';

export interface RenderContext {
  /** Название в нижнем регистре → id страницы. */
  titleIndex: Map<string, string>;
  types: RelationType[];
}

const WIKI = '#/wiki/';
const mdEscape = (s: string) => s.replace(/([\\`*_[\]<>~])/g, '\\$1');

/** [[Название|тип]] → обычная ссылка Markdown, которую затем доработает rehypeWiki. */
function wikiToMarkdown(src: string): string {
  return replaceLinks(src, (l) => {
    const label = l.label ? ` "${l.label.replace(/["\\]/g, '')}"` : '';
    return `[${mdEscape(l.title)}](<${WIKI}${encodeURIComponent(l.title)}>${label})`;
  });
}

const classes = (el: Element): string[] => (Array.isArray(el.properties.className) ? (el.properties.className as string[]) : []);

function findCheckbox(el: Element): { parent: Element; index: number } | null {
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    if (child.type !== 'element') continue;
    if (child.tagName === 'input') return { parent: el, index: i };
    if (child.tagName === 'p') {
      const inner = findCheckbox(child);
      if (inner) return inner;
    }
  }
  return null;
}

function rehypeWiki(ctx: RenderContext) {
  const typeByName = new Map(ctx.types.map((t) => [norm(t.name), t]));

  const visit = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type !== 'element') continue;
      const p = child.properties;
      const href = typeof p.href === 'string' ? p.href : '';

      if (child.tagName === 'a' && href.startsWith(WIKI)) {
        let title = href.slice(WIKI.length);
        try {
          title = decodeURIComponent(title);
        } catch {
          /* оставляем как есть */
        }
        const id = ctx.titleIndex.get(norm(title));
        const label = typeof p.title === 'string' ? p.title : '';
        const type = typeByName.get(norm(label));
        p.className = ['wikilink', ...(id ? [] : ['wikilink--missing'])];
        p.href = id ? `#/page/${id}` : `#/new/${encodeURIComponent(title)}`;
        p.dataTitle = title;
        if (type) p.dataType = type.id;
        p.title = id ? (type ? `Связь: ${type.name}` : 'Открыть страницу') : 'Страницы ещё нет — нажмите, чтобы создать';
        // Текст после черты, не совпавший с типом связи, — подпись ссылки.
        if (label && !type) child.children = [{ type: 'text', value: label }];
      } else if (child.tagName === 'a') {
        p.target = '_blank';
        p.rel = ['noopener', 'noreferrer', 'nofollow'];
      } else if (child.tagName === 'img') {
        // Картинки со сторонних адресов не загружаются (политика CSP) — показываем ссылку.
        const src = typeof p.src === 'string' ? p.src : '';
        child.tagName = 'a';
        child.properties = { href: src, target: '_blank', rel: ['noopener', 'noreferrer', 'nofollow'] };
        child.children = [{ type: 'text', value: `Изображение: ${typeof p.alt === 'string' && p.alt ? p.alt : src}` }];
        continue;
      } else if (/^h[1-5]$/.test(child.tagName)) {
        // Заголовок страницы — единственный h1; заголовки в тексте сдвигаются на уровень.
        child.tagName = `h${Number(child.tagName[1]) + 1}`;
      } else if (child.tagName === 'li' && classes(child).includes('task-list-item')) {
        const box = findCheckbox(child);
        if (box) {
          const input = box.parent.children[box.index] as Element;
          const checked = input.properties.checked === true;
          const mark: ElementContent = {
            type: 'element',
            tagName: 'span',
            properties: {
              className: ['check', ...(checked ? ['is-on'] : [])],
              role: 'checkbox',
              ariaChecked: checked ? 'true' : 'false',
              ariaLabel: 'Отметить пункт',
              tabIndex: 0,
              dataLine: String(child.position?.start.line ?? ''),
            },
            children: [],
          };
          box.parent.children[box.index] = mark;
          if (checked) p.className = [...classes(child), 'is-done'];
        }
      }
      visit(child);
    }
  };
  return (tree: Root) => visit(tree);
}

const SANITIZE = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ['target', 'role', 'tabindex'],
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'video', 'audio', 'img', 'svg', 'math'],
  FORBID_ATTR: ['style', 'id', 'name'],
};

const cache = new Map<string, string>();
let cacheCtx: RenderContext | null = null;

/** Возвращает очищенный HTML. Результаты запоминаются, пока не изменится список страниц. */
export function renderMarkdown(src: string, ctx: RenderContext): string {
  if (cacheCtx !== ctx) {
    cache.clear();
    cacheCtx = ctx;
  }
  let html = cache.get(src);
  if (html === undefined) {
    const raw = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeWiki, ctx)
      .use(rehypeStringify)
      .processSync(wikiToMarkdown(src));
    html = DOMPurify.sanitize(String(raw), SANITIZE);
    if (cache.size > 300) cache.clear();
    cache.set(src, html);
  }
  return html;
}

/** Вставляет очищенный HTML в элемент; при включённых Trusted Types — через политику DOMPurify. */
export function setSafeHtml(el: HTMLElement, src: string, ctx: RenderContext): void {
  const html = renderMarkdown(src, ctx);
  // Повторная санитизация уже чистой строки дешёвая и даёт объект TrustedHTML.
  el.innerHTML = DOMPurify.sanitize(html, { ...SANITIZE, RETURN_TRUSTED_TYPE: true }) as unknown as string;
}
