import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CellList, CellSimple } from '@maxhub/max-ui';
import { useSession } from '../../app/SessionContext';
import { demoEntryUser } from '../../app/demo';
import { BottomSheet } from './BottomSheet';
import { ROUTE_PATTERNS } from '../../routes/paths';

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
  const { me, sandboxUsers, actAs, startSandbox, refresh } = useSession();
  const [sheetOpen, setSheetOpen] = useState(false);
  const navigate = useNavigate();

  // Только внутри песочницы (docs/SCREENS.md): вне её вход в демо — кнопкой на экране приветствия.
  if (!me || !me.demoMode || !me.actingAs || sandboxUsers === null) {
    return null;
  }

  // Та же roleLabel, что и в строках списка ниже - иначе плашка и список могут
  // разойтись (например, у админа с ролью в плашке была видна только роль,
  // без "Администратор", а в списке - оба).
  const activeRole = roleLabel(me.actingAs.roles, me.actingAs.isAdmin).toLowerCase();
  const label = `Демо: действую как ${me.actingAs.user.fullName} (${activeRole})`;

  return (
    <>
      {/* Полоса в потоке страницы, а не плавающая плашка поверх: поверх она закрывала
          заголовок экрана и ссылку «‹ назад» (тест 23.09). sticky - остаётся видна при прокрутке. */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: 'calc(8px + env(safe-area-inset-top)) 16px 8px',
          background: 'var(--background-primary)',
          borderBottom: '1px solid var(--divider-primary)',
        }}
      >
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: 528,
            width: '100%',
            margin: '0 auto',
            padding: '8px 12px',
            borderRadius: 20,
            border: 'none',
            background: 'var(--text-primary)',
            color: 'var(--background-primary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          <span aria-hidden>⌄</span>
        </button>
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Участники песочницы">
        <CellList mode="full-width">
          {sandboxUsers.map((participant, index) => (
            <CellSimple
              key={participant.user.id}
              as="button"
              separator={index > 0}
              onClick={() => {
                // К списку документов: у нового участника может не быть доступа к экрану,
                // на котором стоял прежний (чужой черновик, админка без прав).
                void actAs(participant.user.id).then(() => navigate(ROUTE_PATTERNS.documents));
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
              // После пересоздания прежние id недействительны - сразу входим от имени автора.
              void startSandbox()
                .then((users) => {
                  const entry = demoEntryUser(users);
                  return entry === null ? undefined : actAs(entry);
                })
                // Не удалось пересоздать — свежий /me покажет текущее состояние.
                .catch(() => refresh());
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
