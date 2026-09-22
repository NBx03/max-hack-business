import type { ReactNode } from 'react';
import { Button } from '@maxhub/max-ui';

// Нижняя панель поверх экрана - макеты modal-return-decline-screen,
// modal-reject-confirm-step2-screen: затемнение + панель, выезжающая снизу
// со скруглёнными верхними углами. Закрывается по тапу на затемнение.

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(17, 24, 39, 0.45)' }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 560,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: '20px 20px 24px',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          background: 'var(--background-primary)',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
        }}
      >
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * Подтверждение действия - тот же лист, но с заголовком, описанием и двумя кнопками.
 * Используется и для «Отклонение окончательное» (второй шаг), и для «Перевыпустить код»,
 * «Отменить заявку» и подобных - везде один и тот же паттерн из макетов.
 */
export function ConfirmSheet({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Отмена',
  destructive,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{description}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Button stretched variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
        </div>
        <div style={{ flex: 1 }}>
          <Button stretched variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
