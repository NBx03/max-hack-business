import { useState } from 'react';
import { Button, Typography } from '@maxhub/max-ui';
import { useSession } from '../../app/SessionContext';

function describeParticipant(roles: { name: string }[], isAdmin: boolean): string {
  const labels = roles.map((role) => role.name);
  if (isAdmin) {
    labels.push('Администратор');
  }
  return labels.length > 0 ? labels.join(', ') : 'Без ролей';
}

/**
 * Демо-переключатель участника. Виден только пока фронтенд работает в личной
 * песочнице проверяющего (docs/SCREENS.md, "Общие правила"). Полноценный экран
 * приветствия с кнопкой "Открыть демо-компанию" - отдельная задача (#1);
 * здесь только механизм переключения, без финальной вёрстки.
 */
export function DemoSwitcher() {
  const { me, sandboxUsers, actAs, startSandbox } = useSession();
  const [expanded, setExpanded] = useState(false);

  if (!me || !me.demoMode || sandboxUsers === null) {
    return null;
  }

  const label = me.actingAs
    ? `Демо: действую как ${me.actingAs.user.fullName}`
    : 'Демо: выберите участника';

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        paddingTop: 'env(safe-area-inset-top)',
        background: 'var(--background-primary)',
        borderBottom: '1px solid var(--divider-primary)',
      }}
    >
      <div
        style={{ padding: '8px 16px', cursor: 'pointer' }}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <Typography.Text>{label}</Typography.Text>
      </div>
      {expanded && (
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sandboxUsers.map((participant) => (
            <Button
              key={participant.user.id}
              onClick={() => {
                void actAs(participant.user.id);
                setExpanded(false);
              }}
            >
              {`${participant.user.fullName} — ${describeParticipant(participant.roles, participant.isAdmin)}`}
            </Button>
          ))}
          <Button
            onClick={() => {
              void startSandbox();
              setExpanded(false);
            }}
          >
            Начать заново
          </Button>
          {me.actingAs && (
            <Button
              onClick={() => {
                void actAs(null);
                setExpanded(false);
              }}
            >
              Выйти из демо
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
