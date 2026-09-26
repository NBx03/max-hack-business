import type { CSSProperties, ReactNode } from 'react';

// Переходный каркас для экранов, которые ещё не собраны на ui/Page: карточка документа, проверка и маршрут
// переделываются в PR 2 и PR 4 из #108 и тогда уходят на Page, а этот файл удаляется. Поведение то же, что у
// Page (LAY-1): прокручивается только экран, нижняя панель закреплена и отделена чертой, как ds-page__footer.

const columnStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
};

export function CenteredColumn({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...columnStyle, ...style }}>{children}</div>;
}

export function ScreenShell({ children }: { children: ReactNode }) {
  return (
    <div data-scroll-root className="ds-page__scroll" style={{ display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  );
}

export function FullscreenCenter({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {children}
    </div>
  );
}

export function BottomActionBar({ children }: { children?: ReactNode }) {
  return (
    <div className="ds-page__footer" style={{ position: 'sticky', bottom: 0, zIndex: 10 }}>
      {children}
    </div>
  );
}
