import { Button, Spinner, Typography } from '@maxhub/max-ui';
import { useSession } from './app/SessionContext';
import { DemoSwitcher } from './components/base/DemoSwitcher';
import { OnboardingFlow } from './screens/onboarding/OnboardingFlow';

/**
 * Корень по ответу GET /me (docs/SCREENS.md, «Навигация»): человек без компании видит
 * экраны подключения (#18, screens/onboarding), участник компании или демо — пока заглушку
 * списка документов (#7). Общий каркас навигации — #53.
 */
export function App() {
  const { status, me, error, refresh } = useSession();

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

  // В демо человек действует от имени сотрудника песочницы, а /me.membership — только реальная компания.
  const company = me.actingAs ? me.sandbox?.orgName : me.membership?.orgName;

  return (
    <div>
      <DemoSwitcher />
      {company ? (
        <div style={{ padding: 16 }}>
          <Typography.Title variant="large-strong">{company}</Typography.Title>
          <Typography.Text>Список документов — экран в разработке (#7).</Typography.Text>
        </div>
      ) : (
        // Человек без компании: приветствие, создание, вход по коду или ссылке, ожидание (#18).
        <OnboardingFlow />
      )}
    </div>
  );
}
