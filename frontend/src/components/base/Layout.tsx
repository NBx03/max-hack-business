import type { CSSProperties, ReactNode } from 'react';

// Ширина и прибитая к низу кнопка - docs/SCREENS.md, "Общие правила" ("Главное действие
// экрана - одна заметная кнопка внизу") и "Адаптация под мобильный и веб": колонка до 560px
// по центру на широком окне, кнопка не "утекает" вниз вместе с длинным списком.

const columnStyle: CSSProperties = {
  width: '100%',
  maxWidth: 560,
  margin: '0 auto',
  // Экраны задают колонке внутренние отступы: без border-box ширина 100% + padding
  // выходила за экран телефона, и страница прокручивалась вбок.
  boxSizing: 'border-box',
};

/** Колонка контента - оборачивает экран целиком, чтобы на вебе/десктопе он не растягивался. */
export function CenteredColumn({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...columnStyle, ...style }}>{children}</div>;
}

/**
 * Внешняя обёртка экрана, у которого есть BottomActionBar - растягивает экран на весь
 * вьюпорт, чтобы кнопка внизу не повисала сразу под коротким контентом (см. BottomActionBar
 * про то, почему одного position:sticky для этого недостаточно). CenteredColumn с самим
 * контентом внутри всё равно нужно пометить flex:1 - ScreenShell этого не делает сам,
 * чтобы не навязывать, что именно должно растягиваться на экранах с несколькими блоками.
 */
export function ScreenShell({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>{children}</div>;
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
 *
 * position:sticky держит кнопку у низа только пока есть что прокручивать. На коротком
 * экране (мало данных, пустое состояние) без прокрутки кнопка просто встанет сразу под
 * контентом, а не у края экрана. Чтобы этого не было, экран нужно обернуть в ScreenShell,
 * а CenteredColumn с основным контентом внутри пометить `flex:1` (растягивается и
 * выталкивает эту панель к низу). Не кладите BottomActionBar внутрь того же
 * CenteredColumn, что и контент - у него свой внутренний CenteredColumn, и
 * паддинг/stretch применятся дважды (см. screens/documents/DocumentListScreen.tsx
 * как пример правильной раскладки).
 */
export function BottomActionBar({ children, nav }: { children?: ReactNode; nav?: ReactNode }) {
  // Нижнее меню (AppNav) живёт в той же закреплённой панели, что и главная кнопка: два
  // отдельных sticky-блока с bottom:0 легли бы друг на друга.
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 10,
        background: 'var(--background-primary)',
      }}
    >
      {children && (
        <div style={{ paddingTop: 12, paddingBottom: nav ? 12 : 'calc(12px + env(safe-area-inset-bottom))' }}>
          <CenteredColumn style={{ padding: '0 16px' }}>{children}</CenteredColumn>
        </div>
      )}
      {nav}
    </div>
  );
}
