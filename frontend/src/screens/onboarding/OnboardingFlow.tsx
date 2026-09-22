import { useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { takeStartParam } from '../../app/startParam';
import { CreateCompanyScreen } from './CreateCompanyScreen';
import { JoinByCodeScreen } from './JoinByCodeScreen';
import { PendingRequestScreen } from './PendingRequestScreen';
import { PersonalInviteScreen } from './PersonalInviteScreen';
import { WelcomeScreen } from './WelcomeScreen';

type Step =
  | { kind: 'welcome' }
  | { kind: 'create' }
  | { kind: 'join'; code?: string }
  | { kind: 'personal'; token: string };

/**
 * Экраны человека без компании (#18): приветствие, создание, вход по коду, личная ссылка,
 * ожидание решения. Показываются, пока в /me нет реальной компании и человек не в демо.
 * Порядок веток — «Навигация» в docs/SCREENS.md.
 */
export function OnboardingFlow() {
  const { me } = useSession();
  const [step, setStep] = useState<Step>(() => {
    const start = takeStartParam(me?.startParam);
    if (start.kind === 'companyCode') {
      return { kind: 'join', code: start.code };
    }
    if (start.kind === 'personalInvite') {
      return { kind: 'personal', token: start.token };
    }
    return { kind: 'welcome' };
  });

  // Заявка на рассмотрении важнее всего остального: пока она висит, новую подать нельзя.
  if (me?.pendingJoinRequest) {
    return <PendingRequestScreen request={me.pendingJoinRequest} />;
  }

  const toWelcome = () => setStep({ kind: 'welcome' });
  switch (step.kind) {
    case 'create':
      return <CreateCompanyScreen onBack={toWelcome} />;
    case 'join':
      return <JoinByCodeScreen initialCode={step.code} onBack={toWelcome} />;
    case 'personal':
      return <PersonalInviteScreen token={step.token} onJoinByCode={() => setStep({ kind: 'join' })} />;
    default:
      return (
        <WelcomeScreen onCreate={() => setStep({ kind: 'create' })} onJoin={() => setStep({ kind: 'join' })} />
      );
  }
}
