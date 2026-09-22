import type { ReactNode } from 'react';
import { Button, Typography } from '@maxhub/max-ui';

// Общие состояния "пусто" / "ошибка" / "нет доступа" - docs/SCREENS.md, "Общие правила"
// ("пусто (текст + следующее действие)", "ошибка (текст из message + «Повторить»)"),
// макеты component-empty-state / component-error-state / component-access-error-state.
// Три тонких обёртки над одной карточкой - тексты и действие у каждой свои.

function StateCard({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '32px 24px',
        borderRadius: 12,
        border: '1px solid var(--divider-primary)',
        background: 'var(--background-secondary)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 48,
          height: 48,
          borderRadius: 24,
          border: '1px solid var(--divider-primary)',
          background: 'var(--background-tertiary)',
          fontSize: 20,
          color: 'var(--text-tertiary)',
        }}
      >
        {icon}
      </div>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>{text}</p>
      {action}
    </div>
  );
}

function OutlineButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      {label}
    </Button>
  );
}

/** Пусто: текст + следующее действие (может не быть, например «Новых заявок нет»). */
export function EmptyState({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <StateCard
      icon="☐"
      text={text}
      action={actionLabel && onAction ? <OutlineButton label={actionLabel} onClick={onAction} /> : undefined}
    />
  );
}

/** Ошибка сети/сервиса: текст берётся из ApiError.message бэкенда, не свой. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <StateCard icon="!" text={message} action={<OutlineButton label="Повторить" onClick={onRetry} />} />;
}

/**
 * Ошибка действия без своего "Повторить" (например, решение по шагу или отправка на
 * маршрут) - у ErrorState "Повторить" там означало бы просто спрятать текст, ничего
 * не повторяя на самом деле, а это вводит в заблуждение (PR #71, ревью).
 */
export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <div role="alert" style={{ color: 'var(--text-negative)' }}>
      <Typography.Body variant="medium">{children}</Typography.Body>
    </div>
  );
}

/** 403/404 на документе, недействительное приглашение - без общей ErrorState "Повторить". */
export function AccessErrorState({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <StateCard
      icon="×"
      text={text}
      action={actionLabel && onAction ? <OutlineButton label={actionLabel} onClick={onAction} /> : undefined}
    />
  );
}
