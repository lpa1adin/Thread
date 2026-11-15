interface Props {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  size?: 'sm' | 'lg';
}

/** Круглая отметка, как в «Заметках» (F19). */
export function Check({ on, onChange, label, size }: Props) {
  return (
    <button
      type="button"
      className={`check${size ? ` check--${size}` : ''}${on ? ' is-on' : ''}`}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange(!on);
      }}
    />
  );
}
