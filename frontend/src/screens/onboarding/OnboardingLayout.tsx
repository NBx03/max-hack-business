import type { ReactNode } from 'react';
import { Typography } from '@maxhub/max-ui';
import { CenteredColumn, ScreenShell } from '../../components/base/Layout';

/**
 * Общая раскладка экранов подключения на колонке каркаса (#53): заголовок сверху,
 * главное действие внизу (docs/SCREENS.md, «Общие правила»).
 */
export function OnboardingLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  // Текст прокручивается, действия внизу закреплены: на невысоком телефоне «Создать компанию» не
  // должна уезжать за край экрана (приёмка 24.09).
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <ScreenShell>
        <CenteredColumn
          style={{
            flex: 1,
            boxSizing: 'border-box',
            padding: '24px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Title large-strong в max-ui — 16 px, как основной текст; заголовок экрана — Headline (24 px). */}
            <Typography.Headline variant="large-strong">{title}</Typography.Headline>
            {subtitle && <span style={{ fontSize: 16, lineHeight: '22px', color: 'var(--text-secondary)' }}>{subtitle}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>{children}</div>
        </CenteredColumn>
      </ScreenShell>
      {footer && (
        <div style={{ flex: 'none', background: 'var(--background-primary)', padding: '12px 0 calc(12px + env(safe-area-inset-bottom, 0px))' }}>
          <CenteredColumn style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>{footer}</CenteredColumn>
        </div>
      )}
    </div>
  );
}

/** Ошибка с сервера — его же текстом (docs/SCREENS.md: «Ошибки бэкенда показываем его текстом»). */
export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <div role="alert" style={{ color: 'var(--text-negative)' }}>
      <Typography.Body variant="medium">{children}</Typography.Body>
    </div>
  );
}

/** Подсказка второго плана: пояснения под полями, сроки, служебный текст. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <div style={{ color: 'var(--text-secondary)' }}>
      <Typography.Body variant="small">{children}</Typography.Body>
    </div>
  );
}
