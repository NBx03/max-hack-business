import { useCallback, useEffect, useState } from 'react';
import { Button, Spinner, Typography } from '@maxhub/max-ui';
import { useSession } from '../../app/SessionContext';
import { acceptPersonalInvite, previewPersonalInvite } from '../../api/onboarding';
import { errorMessage } from '../../api/errors';
import type { PersonalInvitePreview } from '../../api/types';
import { ErrorText, Hint, OnboardingLayout } from './OnboardingLayout';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; invite: PersonalInvitePreview }
  | { kind: 'invalid'; message: string };

/**
 * 4б. Вступление по личной ссылке (docs/SCREENS.md, SHOULD). При открытии ничего не происходит:
 * человек видит компанию и роли и вступает только по кнопке (CLAUDE.md, онбординг).
 */
export function PersonalInviteScreen({ token, onJoinByCode }: { token: string; onJoinByCode: () => void }) {
  const { refresh } = useSession();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', invite: await previewPersonalInvite(token) });
    } catch (err) {
      // Использована, просрочена, отозвана или не найдена — текст бэкенда объясняет, что именно.
      setState({ kind: 'invalid', message: errorMessage(err) });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptPersonalInvite(token);
      await refresh();
    } catch (err) {
      // Ссылку могли успеть использовать или отозвать, пока экран был открыт.
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (state.kind === 'loading') {
    return (
      <OnboardingLayout title="Приглашение">
        <Spinner />
      </OnboardingLayout>
    );
  }

  if (state.kind === 'invalid') {
    return (
      <OnboardingLayout
        title="Ссылка недействительна"
        footer={
          <Button size="large" stretched onClick={onJoinByCode}>
            Присоединиться по коду
          </Button>
        }
      >
        <ErrorText>{state.message}</ErrorText>
        <Hint>Попросите у администратора новую ссылку или код компании.</Hint>
      </OnboardingLayout>
    );
  }

  const { invite } = state;
  const expires = new Date(invite.expiresAt);
  return (
    <OnboardingLayout
      title={invite.orgName}
      subtitle="Вас пригласили в компанию. После вступления вы получите роли:"
      footer={
        <Button size="large" stretched loading={busy} onClick={() => void join()}>
          Вступить
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {invite.roles.map((role) => (
          <Typography.Body key={role.id} variant="large-strong">
            {role.name}
          </Typography.Body>
        ))}
      </div>
      {!Number.isNaN(expires.getTime()) && (
        <Hint>
          Ссылка действует до{' '}
          {expires.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
        </Hint>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </OnboardingLayout>
  );
}
