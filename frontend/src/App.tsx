import { Button, Spinner, Typography } from '@maxhub/max-ui';
import { useSession } from './app/SessionContext';
import { DemoSwitcher } from './components/base/DemoSwitcher';

/**
 * Каркас: подключение к MAX и бэкенду (#6) сделано, сами экраны - отдельные
 * задачи (#1, #7, #18). Ниже - временные заглушки веток навигации из
 * docs/SCREENS.md, чтобы результат GET /me и демо-переключатель были видны
 * и проверяемы уже сейчас.
 */
export function App() {
  const { status, me, error, sandboxUsers, refresh, startSandbox } = useSession();

  if (status === 'loading') {
    return (
      <div style={{ padding: 16 }}>
        <Spinner />
      </div>
    );
  }

  if (status === 'error' || !me) {
    return (
      <div style={{ padding: 16 }}>
        <Typography.Text>{error?.message ?? 'Сервис временно недоступен, попробуйте ещё раз'}</Typography.Text>
        <div style={{ marginTop: 12 }}>
          <Button onClick={() => void refresh()}>Повторить</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <DemoSwitcher />
      <div style={{ padding: 16 }}>
        <Typography.Title variant="large-strong">Согласование документов</Typography.Title>

        {me.membership && (
          <Typography.Text>
            Список документов «{me.membership.orgName}» — экран в разработке (#7, #18).
          </Typography.Text>
        )}

        {!me.membership && me.pendingJoinRequest && (
          <Typography.Text>
            Заявка отправлена в «{me.pendingJoinRequest.orgName}». Ждём решения администратора.
          </Typography.Text>
        )}

        {!me.membership && !me.pendingJoinRequest && (
          <div>
            <Typography.Text>Экран приветствия в разработке (#1, #7).</Typography.Text>
            {me.demoMode && sandboxUsers === null && (
              <div style={{ marginTop: 12 }}>
                <Button onClick={() => void startSandbox()}>Открыть демо-компанию</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
