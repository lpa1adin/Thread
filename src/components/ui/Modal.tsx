import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  text?: ReactNode;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Диалог: закрывается по Esc и нажатию на фон, удерживает фокус внутри, возвращает его при закрытии. */
export function Modal({ title, text, wide, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const box = ref.current!;
    (box.querySelector<HTMLElement>('[data-autofocus]') ?? box.querySelector<HTMLElement>(FOCUSABLE) ?? box).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.stopPropagation();
        close.current();
      } else if (e.key === 'Tab') {
        const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
        else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal${wide ? ' modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <h2 className="modal__title">{title}</h2>
        {text && <p className="modal__text">{text}</p>}
        {children}
      </div>
    </div>
  );
}
