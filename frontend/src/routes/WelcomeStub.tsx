import { Button, Typography } from '@maxhub/max-ui';
import { useSession } from '../app/SessionContext';
import { CenteredColumn } from '../components/base/Layout';

/**
 * Экран 1 (Приветствие) - заглушка вёрстки (#1, #7), но кнопка демо-компании уже
 * рабочая: она была в App.tsx до вынесения роутинга (#6) и здесь только переехала.
 */
export function WelcomeStub() {
  const { me, sandboxUsers, startSandbox } = useSession();

  return (
    <CenteredColumn style={{ padding: 16 }}>
      <Typography.Title variant="medium">1. Приветствие</Typography.Title>
      <Typography.Text>Экран в разработке (#1, #7): «Создать компанию», «Присоединиться по коду».</Typography.Text>
      {me?.demoMode && sandboxUsers === null && (
        <div style={{ marginTop: 12 }}>
          <Button onClick={() => void startSandbox()}>Открыть демо-компанию</Button>
        </div>
      )}
    </CenteredColumn>
  );
}
