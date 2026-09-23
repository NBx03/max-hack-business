import { useEffect, useRef } from 'react';

// Краткое подтверждение после действия (2-3 сек), затем экран обновляется - макет
// component-toast-confirmation. Например: "Документ возвращён автору", "Документ отклонён",
// "Отправлено. Согласующие получили уведомление".

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  // onDismiss обычно новая функция на каждом рендере вызывающего экрана. Таймер должен
  // перезапускаться только когда показан новый тост (message изменился), а не при любом
  // ре-рендере родителя - иначе тост может не скрыться, пока рядом что-то меняется на экране.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), 2500);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 16px',
        borderRadius: 8,
        background: 'var(--text-primary)',
        color: 'var(--background-primary)',
        fontSize: 14,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
      }}
    >
      <span aria-hidden>✓</span>
      {message}
    </div>
  );
}
