import { useState } from 'react';
import { errorMessage } from '../../api/errors';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { demoEntryUser } from '../../app/demo';
import { BottomSheet, Button, Icon, InlineError, List, Row } from '../../ui';
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
  const { me, sandboxUsers, actAs, startSandbox } = useSession();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Только внутри песочницы (docs/SCREENS.md): вне её вход в демо — кнопкой на экране приветствия.
  if (!me || !me.demoMode || !me.actingAs || sandboxUsers === null) {
    return null;
  }

  // Та же roleLabel, что и в строках списка ниже — плашка и список не расходятся.
  const activeRole = roleLabel(me.actingAs.roles, me.actingAs.isAdmin).toLowerCase();

  return (
    <>
      {/* Полоса в потоке страницы, а не поверх: поверх она закрывала заголовок (тест 23.09). Отступ сверху —
          ровные 8 px без safe-area: шапку над мини-приложением рисует сам MAX, а на Android safe-area давала
          лишний сантиметр пустоты (LAY-3). Подпись переносится, а не обрезается (принцип 6). */}
      <div className="ds-demo-bar">
        <button type="button" className="ds-demo-bar__button" onClick={() => setSheetOpen(true)}>
          <span className="ds-demo-bar__label">
            <strong>Демо</strong> · вы действуете как {me.actingAs.user.fullName} ({activeRole})
          </span>
          <Icon name="chevronDown" size={18} />
        </button>
      </div>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Участники песочницы"
        dismissible={!restarting}
      >
        <List label="Участники песочницы">
          {sandboxUsers.map((participant) => (
            <Row
              key={participant.user.id}
              title={participant.user.fullName}
              subtitle={roleLabel(participant.roles, participant.isAdmin)}
              after={me.actingAs?.user.id === participant.user.id ? <Icon name="check" size={22} label="Сейчас вы действуете как этот участник" /> : undefined}
              chevron={false}
              onClick={() => {
                // На главную: у нового участника может не быть доступа к экрану, на котором стоял прежний.
                void actAs(participant.user.id).then(() => navigate(ROUTE_PATTERNS.home));
                setSheetOpen(false);
              }}
            />
          ))}
        </List>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button
            stretched
            loading={restarting}
            onClick={() => {
              // Шторка остаётся открытой до результата: ошибку пересоздания человек видит здесь же,
              // а не теряет молча (ревью #87). Прежнего участника при сбое возвращает startSandbox.
              setRestarting(true);
              setRestartError(null);
              startSandbox()
                .then((users) => {
                  // После пересоздания прежние id недействительны - сразу входим от имени автора.
                  const entry = demoEntryUser(users);
                  setSheetOpen(false);
                  return entry === null ? undefined : actAs(entry);
                })
                .catch((err: unknown) => setRestartError(errorMessage(err)))
                .finally(() => setRestarting(false));
            }}
          >
            Начать заново
          </Button>
          {restartError && <InlineError>{restartError}</InlineError>}
          {me.actingAs && (
            <Button
              stretched
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
