import { useGoBack } from '../../routes/backNavigation';

/**
 * «‹ Документы» над заголовком экрана — видимый путь назад внутри самого приложения.
 * Системная кнопка MAX есть не везде и её не все замечают (тест 23.09); ведёт туда же,
 * что и она (routes/backNavigation.ts).
 */
export function BackLink({ to, label }: { to: string; label: string }) {
  const goBack = useGoBack();
  return (
    <button
      type="button"
      onClick={() => goBack(to)}
      style={{
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        margin: '-4px 0 -8px -4px',
        padding: '4px',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-themed)',
        fontSize: 15,
        cursor: 'pointer',
      }}
    >
      <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>‹</span>
      {label}
    </button>
  );
}
