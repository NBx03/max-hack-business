import { useId, useRef } from 'react';

// Выбор файла - макет document-upload-screen ("field-file-upload"): до выбора -
// пунктирная зона с кнопкой "Выбрать файл", после - имя и размер файла и кнопка "Заменить".

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(kb < 10 ? 1 : 0)} КБ`;
  }
  return `${(kb / 1024).toFixed(1)} МБ`;
}

export function FilePicker({
  label,
  hint,
  accept,
  file,
  onSelect,
}: {
  label: string;
  hint?: string;
  accept?: string;
  file: File | null;
  onSelect: (file: File) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</span>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '20px 16px',
          borderRadius: 8,
          border: `1px dashed var(--divider-primary)`,
          background: 'var(--background-secondary)',
          textAlign: 'center',
        }}
      >
        {file ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
              {file.name} · {formatFileSize(file.size)}
            </span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--background-tertiary)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Заменить
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Перетащите файл сюда или нажмите кнопку
            </span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--background-tertiary)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Выбрать файл
            </button>
          </>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) {
              onSelect(selected);
            }
            // Иначе повторный выбор того же файла не вызовет onChange.
            event.target.value = '';
          }}
          style={{ display: 'none' }}
        />
      </div>

      {hint && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{hint}</span>}
    </div>
  );
}
