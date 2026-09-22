import type { ReactNode } from 'react';
import { Typography } from '@maxhub/max-ui';

/**
 * Общая раскладка экранов подключения: колонка до 560 px по центру (веб-версия MAX),
 * заголовок сверху, главное действие внизу (docs/SCREENS.md, «Общие правила»).
 * Когда в #53 появится общий каркас экранов, эту обёртку заменяем на него.
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
    <div
      style={{
        maxWidth: 560,
        margin: '0 auto',
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
