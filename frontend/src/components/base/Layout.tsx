import type { CSSProperties, ReactNode } from 'react';

// Ширина и прибитая к низу кнопка - docs/SCREENS.md, "Общие правила" ("Главное действие
// экрана - одна заметная кнопка внизу") и "Адаптация под мобильный и веб": колонка до 560px
// по центру на широком окне, кнопка не "утекает" вниз вместе с длинным списком.

const columnStyle: CSSProperties = {
  width: '100%',
  maxWidth: 560,
  margin: '0 auto',
};

/** Колонка контента - оборачивает экран целиком, чтобы на вебе/десктопе он не растягивался. */
export function CenteredColumn({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...columnStyle, ...style }}>{children}</div>;
}

/** Центрирует контент по всему экрану - загрузка и общая ошибка сессии (App.tsx). */
export function FullscreenCenter({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Главная кнопка экрана, прибитая к низу вьюпорта - остаётся видимой на длинных экранах
 * (карточка, результат проверки, список) независимо от прокрутки контента над ней.
 */
export function BottomActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        paddingTop: 12,
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
        background: 'var(--background-primary)',
      }}
    >
      <CenteredColumn style={{ padding: '0 16px' }}>{children}</CenteredColumn>
    </div>
  );
}
