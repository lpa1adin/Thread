import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { useBase } from '../../app/base';
import { setSafeHtml } from '../../lib/markdown';

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
    if (ref.current) setSafeHtml(ref.current, source, render);
  }, [source, render]);

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
      onClick={(e: MouseEvent) => toggle(e.target) && e.preventDefault()}
      onKeyDown={(e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && toggle(e.target) && e.preventDefault()}
    />
  );
}
