import { Button } from '@maxhub/max-ui';
import { useSession } from '../../app/SessionContext';
import { useOpenDemo } from '../../app/useOpenDemo';
import { ErrorText, Hint, OnboardingLayout } from './OnboardingLayout';

/** 1. Приветствие (docs/SCREENS.md). */
export function WelcomeScreen({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  const { me } = useSession();
  const demo = useOpenDemo();

  return (
    <OnboardingLayout
      title="Согласование документов"
      subtitle="Загрузите документ — ИИ прочитает его, правила компании проверят, а люди согласуют по маршруту. Прямо в MAX."
      footer={
        <>
          <Button size="large" stretched onClick={onCreate}>
            Создать компанию
          </Button>
          <Button size="large" variant="secondary" stretched onClick={onJoin}>
            Присоединиться по коду
          </Button>
          {me?.demoMode && (
            <Button size="large" variant="ghost" stretched loading={demo.busy} onClick={() => void demo.open()}>
              {demo.hasSandbox ? 'Вернуться в демо-компанию' : 'Открыть демо-компанию'}
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
      {demo.error && <ErrorText>{demo.error}</ErrorText>}
    </OnboardingLayout>
  );
}
