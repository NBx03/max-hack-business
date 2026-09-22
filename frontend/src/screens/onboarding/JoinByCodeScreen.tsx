import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Input, Typography } from '@maxhub/max-ui';
import { useSession } from '../../app/SessionContext';
import { previewInviteCode, submitJoinRequest } from '../../api/onboarding';
import { ApiError, errorMessage } from '../../api/errors';
import { ErrorText, Hint, OnboardingLayout } from './OnboardingLayout';

/** Алфавит кода — тот же, что у бэкенда (InviteSecrets): без 0, 1, O, I, L. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** Код могли переписать с пробелами, дефисами или строчными буквами. */
export function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}

function codeProblem(code: string): string | null {
  if ([...code].some((ch) => !CODE_ALPHABET.includes(ch))) {
    return 'В коде нет букв O, I, L и цифр 0, 1 — проверьте, не перепутаны ли символы';
  }
  return null;
}

/** «Слишком много попыток» — с подсказкой, когда пробовать снова. */
function attemptMessage(err: unknown): string {
  if (err instanceof ApiError && err.code === 'TOO_MANY_ATTEMPTS') {
    const seconds = Number(err.details?.retryAfterSeconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      return `${err.message} Попробуйте через ${Math.ceil(seconds / 60)} мин.`;
    }
  }
  return errorMessage(err);
}

/** 4. Присоединение по коду (docs/SCREENS.md). Код из ссылки `startapp=c_<код>` уже подставлен. */
export function JoinByCodeScreen({ initialCode, onBack }: { initialCode?: string; onBack: () => void }) {
  const { refresh } = useSession();
  const [raw, setRaw] = useState(initialCode ?? '');
  const [orgName, setOrgName] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const code = normalizeCode(raw);
  const problem = codeProblem(code);
  const complete = code.length === CODE_LENGTH && problem === null;

  // Каждая неверная попытка расходует лимит, поэтому проверяем по нажатию, а не на каждый символ.
  const check = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!complete || checking) {
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const preview = await previewInviteCode(code);
      setOrgName(preview.orgName);
    } catch (err) {
      setError(attemptMessage(err));
    } finally {
      setChecking(false);
    }
  };

  // Пришли по ссылке с кодом — показываем компанию сразу, без лишнего нажатия.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (initialCode && !autoChecked.current) {
      autoChecked.current = true;
      void check();
    }
    // Только один раз при открытии экрана по ссылке, поэтому зависимостей нет.
  }, []);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await submitJoinRequest(code);
      // Дальше /me покажет экран ожидания решения.
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'JOIN_REQUEST_EXISTS' || err.code === 'ALREADY_MEMBER')) {
        // Заявка уже есть или человек уже в компании — /me знает, какой экран показать.
        await refresh();
        return;
      }
      setError(attemptMessage(err));
      setSending(false);
    }
  };

  const edit = (value: string) => {
    setRaw(value);
    setOrgName(null);
    setError(null);
  };

  return (
    <OnboardingLayout
      title="Вступление по коду"
      subtitle="Код компании даёт администратор — обычно его присылают в рабочий чат."
      footer={
        <>
          {orgName ? (
            <Button size="large" stretched loading={sending} onClick={() => void send()}>
              Отправить заявку
            </Button>
          ) : (
            <Button size="large" stretched disabled={!complete} loading={checking} onClick={() => void check()}>
              Найти компанию
            </Button>
          )}
          <Button size="large" variant="ghost" stretched disabled={sending} onClick={onBack}>
            Назад
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => void check(event)} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Typography.Label variant="medium-strong">Код компании</Typography.Label>
        <Input
          value={raw}
          placeholder="Например, KX7M2PQR"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={16}
          autoFocus={!initialCode}
          onChange={(event) => edit(event.target.value)}
        />
        {problem ? <ErrorText>{problem}</ErrorText> : <Hint>8 символов, заглавные буквы и цифры.</Hint>}
        <button type="submit" hidden aria-hidden />
      </form>

      {orgName && (
        <Typography.Body variant="large-strong">Вы вступаете в „{orgName}“</Typography.Body>
      )}
      {orgName && (
        <Hint>
          Администратор получит заявку и назначит вам роли. До его решения документы компании не видны.
        </Hint>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </OnboardingLayout>
  );
}
