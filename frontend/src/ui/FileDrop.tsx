import { useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from './icons';
import { BottomSheet } from './Sheet';

// Зона загрузки (UPL-1, UPL-2, UPL-6): крупная пунктирная карточка на всю ширину — не маленькая тёмная кнопка, в которую
// трудно попасть. После выбора — карточка файла с «Заменить» и «Убрать». Ошибка — прямо в зоне: красная обводка и текст,
// в видимой области. «?» в углу — справка «Какие файлы подходят»: иконка ~20 px, зона нажатия 44×44.

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} КБ`;
  return `${(kb / 1024).toFixed(1)} МБ`;
}

export function FileDrop({
  file,
  accept,
  title,
  caption,
  error,
  note,
  help,
  onSelect,
  onRemove,
}: {
  file: File | null;
  accept: string;
  /** «Выберите файл PDF, DOCX или DOC». */
  title: string;
  /** Некликабельная строка под зоной: «PDF, DOCX или DOC · до 10 МБ». */
  caption: string;
  /** Файл не подошёл — текст в зоне, красная обводка. */
  error?: string | null;
  /** Спокойная информационная строка на карточке файла (ограниченная проверка), не ошибка. */
  note?: ReactNode;
  /** Содержимое справки «Какие файлы подходят». */
  help: ReactNode;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const pick = () => inputRef.current?.click();

  return (
    <div className="ds-field">
      <div className={`ds-filedrop ${error ? 'ds-filedrop--error' : ''} ${file ? 'ds-filedrop--filled' : ''}`}>
        <button type="button" className="ds-filedrop__help" aria-label="Какие файлы подходят" onClick={() => setHelpOpen(true)}>
          <Icon name="help" size={20} />
        </button>
        {file && !error ? (
          <div className="ds-filedrop__file">
            <span className="ds-filedrop__icon"><Icon name="file" size={28} /></span>
            <span className="ds-row__body">
              <span className="ds-row__title">{file.name}</span>
              <span className="ds-row__subtitle">{formatFileSize(file.size)}</span>
            </span>
          </div>
        ) : (
          <button type="button" className="ds-filedrop__pick" onClick={pick}>
            <span className="ds-filedrop__icon"><Icon name={error ? 'alert' : 'upload'} size={32} /></span>
            <span className="ds-filedrop__title">{error ? 'Выберите другой файл' : title}</span>
          </button>
        )}
        {error && <p className="ds-filedrop__error" role="alert">{error}</p>}
        {file && !error && (
          <>
            {note && <div className="ds-filedrop__note"><Icon name="info" size={18} />{note}</div>}
            <div className="ds-button-row" style={{ width: '100%' }}>
              <Button compact onClick={pick}>Заменить</Button>
              <Button compact onClick={onRemove}>Убрать</Button>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          hidden
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) onSelect(selected);
            // Иначе повторный выбор того же файла не вызовет onChange.
            event.target.value = '';
          }}
        />
      </div>
      <p className="ds-section__hint" style={{ margin: 0 }}>{caption}</p>
      <BottomSheet open={helpOpen} onClose={() => setHelpOpen(false)} title="Какие файлы подходят">
        {help}
      </BottomSheet>
    </div>
  );
}

/** Шаги создания документа (UPL-3): «1. Файл → 2. Проверка → 3. Маршрут». */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="ds-stepper" aria-label={`Шаг ${current + 1} из ${steps.length}`}>
      {steps.map((step, index) => (
        <li
          key={step}
          className={`ds-stepper__step ${index < current ? 'ds-stepper__step--done' : ''} ${index === current ? 'ds-stepper__step--current' : ''}`}
          aria-current={index === current ? 'step' : undefined}
        >
          <span className="ds-stepper__num">{index < current ? <Icon name="check" size={14} /> : index + 1}</span>
          <span className="ds-stepper__label">{step}</span>
        </li>
      ))}
    </ol>
  );
}
