import type { ReactNode } from 'react';
import { IconButton } from './Button';
import { Icon } from './icons';

/** Поле поиска сверху списка (NAV-3): иконка, текст, крестик очистки. */
export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="ds-search">
      <span className="ds-search__icon">
        <Icon name="search" size={20} />
      </span>
      <input
        className="ds-search__input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && <IconButton className="ds-search__clear" icon="close" label="Очистить" size={18} onClick={() => onChange('')} />}
    </div>
  );
}

/**
 * Ряд чипов-фильтров; подписи не обрезаются (принцип 6). wrap — переносятся на следующую строку: для выбора варианта,
 * где скрытый за краем чип просто не заметят.
 */
export function Chips({ children, label, wrap }: { children: ReactNode; label: string; wrap?: boolean }) {
  return (
    <div className={`ds-chips${wrap ? ' ds-chips--wrap' : ''}`} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="ds-chip" aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  );
}
