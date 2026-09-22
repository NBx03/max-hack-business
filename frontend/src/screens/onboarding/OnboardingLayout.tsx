import type { ReactNode } from 'react';
import { Typography } from '@maxhub/max-ui';
import { CenteredColumn } from '../../components/base/Layout';

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
  return (
    <CenteredColumn
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        padding: '24px 16px calc(16px + env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Title large-strong в max-ui — 16 px, как основной текст; заголовок экрана — Headline (24 px). */}
        <Typography.Headline variant="large-strong">{title}</Typography.Headline>
        {subtitle && <Typography.Body variant="medium">{subtitle}</Typography.Body>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>{children}</div>
      {footer && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{footer}</div>}
    </CenteredColumn>
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
