import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { useBase } from '../../app/base';
import { attachmentUrl } from '../../lib/attachments';
import { setSafeHtml } from '../../lib/markdown';
import { showImage } from '../../app/store';

const LANGUAGE_NAMES: Record<string, string> = {
  c: 'C', cpp: 'C++', csharp: 'C#', css: 'CSS', xml: 'HTML', html: 'HTML', javascript: 'JavaScript', js: 'JavaScript', jsx: 'JSX',
  typescript: 'TypeScript', ts: 'TypeScript', tsx: 'TSX', python: 'Python', py: 'Python', java: 'Java', go: 'Go', rust: 'Rust',
  bash: 'Bash', sh: 'Shell', shell: 'Shell', sql: 'SQL', json: 'JSON', yaml: 'YAML', markdown: 'Markdown', php: 'PHP', ruby: 'Ruby',
  kotlin: 'Kotlin', swift: 'Swift', graphql: 'GraphQL', diff: 'Diff', ini: 'INI', makefile: 'Makefile', plaintext: 'Текст',
};

/** Добавляет к блокам кода название языка и кнопку «Копировать». */
function decorateCode(root: HTMLElement): void {
  for (const pre of root.querySelectorAll<HTMLPreElement>('pre')) {
    const code = pre.querySelector('code');
    if (!code) continue;
    const lang = [...code.classList].find((c) => c.startsWith('language-'))?.slice(9) ?? '';
    const bar = document.createElement('div');
    bar.className = 'code__bar';
    const label = document.createElement('span');
    label.className = 'code__lang';
    label.textContent = LANGUAGE_NAMES[lang] ?? lang;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'code__copy';
    copy.textContent = 'Копировать';
    copy.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(code.textContent ?? '').then(
        () => (copy.textContent = 'Скопировано'),
        () => (copy.textContent = 'Не скопировалось'),
      );
      window.setTimeout(() => (copy.textContent = 'Копировать'), 1800);
    });
    bar.append(label, copy);
    const box = document.createElement('div');
    box.className = 'code';
    pre.replaceWith(box);
    box.append(bar, pre);
  }
}

interface Props {
  source: string;
  /** Нажатие на круглую отметку пункта списка; номер строки в исходном тексте. */
  onToggleTask?: (line: number) => void;
  className?: string;
}

export function Markdown({ source, onToggleTask, className = '' }: Props) {
  const { render } = useBase();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setSafeHtml(el, source, render);
    decorateCode(el);
    // Прикреплённые изображения читаются из базы и показываются по адресу blob:.
    for (const img of el.querySelectorAll<HTMLImageElement>('img[data-attachment]')) {
      attachmentUrl(img.dataset.attachment!).then(
        (url) => (img.src = url),
        () => {
          const note = document.createElement('span');
          note.className = 'md__noimage';
          note.textContent = `Изображение не найдено${img.alt ? `: ${img.alt}` : ''}`;
          img.replaceWith(note);
        },
      );
    }
  }, [source, render]);

  const zoom = (target: EventTarget): boolean => {
    const img = target as HTMLImageElement;
    if (img.tagName !== 'IMG' || !img.classList.contains('md__image') || !img.src) return false;
    showImage(img.src, img.alt);
    return true;
  };

  const toggle = (target: EventTarget): boolean => {
    const el = (target as HTMLElement).closest<HTMLElement>('.check[data-line]');
    if (!el || !onToggleTask) return false;
    // Отклик сразу, не дожидаясь записи в базу.
    const on = el.classList.toggle('is-on');
    el.setAttribute('aria-checked', String(on));
    el.closest('li')?.classList.toggle('is-done', on);
    onToggleTask(Number(el.dataset.line));
    return true;
  };

  return (
    <div
      ref={ref}
      className={`md ${onToggleTask ? '' : 'md--static'} ${className}`}
      onClick={(e: MouseEvent) => (toggle(e.target) || zoom(e.target)) && e.preventDefault()}
      onKeyDown={(e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && toggle(e.target) && e.preventDefault()}
    />
  );
}
