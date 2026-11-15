import { Plus } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useBase } from '../../app/base';
import { cleanTitle, norm } from '../../core/text';
import { TypeDot } from './TypeDot';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Выбор из списка или Enter. */
  onPick?: (title: string) => void;
  excludeIds?: string[];
  placeholder?: string;
  autoFocus?: boolean;
  label: string;
}

/** Поле выбора страницы по названию с подсказками; несуществующее название предлагается создать. */
export function ConceptPicker({ value, onChange, onPick, excludeIds = [], placeholder, autoFocus, label }: Props) {
  const { concepts, render } = useBase();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const options = useMemo(() => {
    const q = norm(value);
    const exclude = new Set(excludeIds);
    const found = concepts.filter((c) => !exclude.has(c.id) && norm(c.title).includes(q)).slice(0, 7);
    const title = cleanTitle(value);
    const isNew = !!title && !render.titleIndex.has(norm(title));
    return { found, newTitle: isNew ? title : null };
  }, [value, concepts, excludeIds, render]);

  const count = options.found.length + (options.newTitle ? 1 : 0);
  const pick = (title: string) => {
    onChange(title);
    setOpen(false);
    onPick?.(title);
  };
  const titleAt = (i: number) => (i < options.found.length ? options.found[i].title : options.newTitle!);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!count) return;
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + count) % count);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && count) pick(titleAt(Math.min(active, count - 1)));
      else if (value.trim()) onPick?.(cleanTitle(value));
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="suggest">
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={open && count > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        data-autofocus={autoFocus || undefined}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKey}
      />
      {open && count > 0 && (
        <ul className="suggest__list" id={listId} role="listbox">
          {options.found.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              className={`suggest__item${i === active ? ' is-active' : ''}`}
              onMouseDown={(e) => (e.preventDefault(), pick(c.title))}
            >
              <TypeDot type={c.type} status={c.status} />
              {c.title}
            </li>
          ))}
          {options.newTitle && (
            <li
              role="option"
              aria-selected={active === options.found.length}
              className={`suggest__item${active === options.found.length ? ' is-active' : ''}`}
              onMouseDown={(e) => (e.preventDefault(), pick(options.newTitle!))}
            >
              <Plus size={15} /> Новая страница «{options.newTitle}»
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
