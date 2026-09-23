import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@maxhub/max-ui';

// Нижняя панель поверх экрана - макеты modal-return-decline-screen,
// modal-reject-confirm-step2-screen: затемнение + панель, выезжающая снизу
// со скруглёнными верхними углами. Закрывается по тапу на затемнение и по Esc
// (веб-версия MAX), фокус уходит в панель и возвращается туда, откуда её открыли.

// Открытые панели по порядку открытия: Esc закрывает только верхнюю. Иначе Esc в «Отключить?»
// закрыл бы и шторку участника под ней — у каждой свой обработчик на document (ревью #87).
const openSheets: symbol[] = [];

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** false — идёт запрос: ни Esc, ни тап по затемнению панель не закрывают, как и заблокированная «Отмена». */
  dismissible?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!open) {
      return;
    }
    const id = Symbol('sheet');
    openSheets.push(id);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && openSheets[openSheets.length - 1] === id && dismissibleRef.current) {
        onCloseRef.current();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      openSheets.splice(openSheets.indexOf(id), 1);
      opener?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div
        onClick={() => {
          if (dismissible) onClose();
        }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(17, 24, 39, 0.45)' }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          outline: 'none',
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
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Идёт запрос - блокирует обе кнопки, чтобы не отправить действие дважды. */
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title} dismissible={!busy}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{description}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Button stretched variant="secondary" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </Button>
        </div>
        <div style={{ flex: 1 }}>
          <Button stretched variant={destructive ? 'destructive' : 'primary'} disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
