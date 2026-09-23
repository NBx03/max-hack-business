import { useState } from 'react';
import { Button, CellList, CellSimple } from '@maxhub/max-ui';
import { useSession } from '../../app/SessionContext';
import { BottomSheet } from './BottomSheet';

function roleLabel(roles: { name: string }[], isAdmin: boolean): string {
  const labels = roles.map((role) => role.name);
  if (isAdmin) {
    labels.push('Администратор');
  }
  return labels.length > 0 ? labels.join(', ') : 'Без ролей';
}

/**
 * Демо-переключатель участника - плашка в углу (макет demo-banner-component) и
 * панель со списком песочницы (макет demo-persona-switcher-sheet). Виден только
 * пока фронтенд работает в личной песочнице проверяющего (docs/SCREENS.md,
 * "Общие правила": "/me.actingAs не пустой").
 */
export function DemoSwitcher() {
  const { me, sandboxUsers, actAs, startSandbox } = useSession();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!me || !me.demoMode || sandboxUsers === null) {
    return null;
  }

  // Та же roleLabel, что и в строках списка ниже - иначе плашка и список могут
  // разойтись (например, у админа с ролью в плашке была видна только роль,
  // без "Администратор", а в списке - оба).
  const activeRole = me.actingAs ? roleLabel(me.actingAs.roles, me.actingAs.isAdmin).toLowerCase() : null;
  const label = me.actingAs
    ? `Демо: действую как ${me.actingAs.user.fullName}${activeRole ? ` (${activeRole})` : ''}`
    : 'Демо: выберите участника';

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        style={{
          position: 'fixed',
          top: 'calc(16px + env(safe-area-inset-top))',
          right: 16,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          borderRadius: 20,
          border: 'none',
          background: 'var(--text-primary)',
          color: 'var(--background-primary)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span aria-hidden>⌄</span>
      </button>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Участники песочницы">
        <CellList mode="full-width">
          {sandboxUsers.map((participant, index) => (
            <CellSimple
              key={participant.user.id}
              as="button"
              separator={index > 0}
              onClick={() => {
                void actAs(participant.user.id);
                setSheetOpen(false);
              }}
              title={participant.user.fullName}
              subtitle={roleLabel(participant.roles, participant.isAdmin)}
              after={
                me.actingAs?.user.id === participant.user.id ? (
                  <span style={{ color: 'var(--text-primary)', fontSize: 14 }} aria-label="Текущий участник">
                    ●
                  </span>
                ) : undefined
              }
            />
          ))}
        </CellList>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button
            variant="secondary"
            onClick={() => {
              void startSandbox();
              setSheetOpen(false);
            }}
          >
            Начать заново
          </Button>
          {me.actingAs && (
            <Button
              variant="secondary"
              onClick={() => {
                void actAs(null);
                setSheetOpen(false);
              }}
            >
              Выйти из демо
            </Button>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
