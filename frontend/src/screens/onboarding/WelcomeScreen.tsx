import { useState } from 'react';
import { Button } from '@maxhub/max-ui';
import { useSession } from '../../app/SessionContext';
import { errorMessage } from '../../api/errors';
import { demoEntryUser } from '../../app/demo';
import { ErrorText, Hint, OnboardingLayout } from './OnboardingLayout';

/** 1. Приветствие (docs/SCREENS.md). */
export function WelcomeScreen({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  const { me, sandboxUsers, startSandbox, actAs } = useSession();
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const hasSandbox = Boolean(me?.sandbox) && sandboxUsers !== null && sandboxUsers.length > 0;

  const openDemo = async () => {
    setDemoBusy(true);
    setDemoError(null);
    try {
      // Уже созданную песочницу не пересоздаём: проверяющий вернётся к своим документам.
      const users = hasSandbox ? sandboxUsers : await startSandbox();
      const entry = demoEntryUser(users);
      if (entry === null) {
        setDemoError('Не удалось открыть демо-компанию, попробуйте ещё раз');
        return;
      }
      await actAs(entry);
    } catch (err) {
      setDemoError(errorMessage(err));
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <OnboardingLayout
      title="Согласование документов"
      subtitle="Загрузите документ, проверьте его по правилам и проведите по маршруту согласования — прямо в MAX."
      footer={
        <>
          <Button size="large" stretched onClick={onCreate}>
            Создать компанию
          </Button>
          <Button size="large" variant="secondary" stretched onClick={onJoin}>
            Присоединиться по коду
          </Button>
          {me?.demoMode && (
            <Button size="large" variant="ghost" stretched loading={demoBusy} onClick={() => void openDemo()}>
              {hasSandbox ? 'Вернуться в демо-компанию' : 'Открыть демо-компанию'}
            </Button>
          )}
        </>
      }
    >
      {me?.demoMode && (
        <Hint>
          Демо-компания — ваша личная копия с готовыми сотрудниками и документами: действуйте от имени
          любого из них, другим это не мешает.
        </Hint>
      )}
      {demoError && <ErrorText>{demoError}</ErrorText>}
    </OnboardingLayout>
  );
}
