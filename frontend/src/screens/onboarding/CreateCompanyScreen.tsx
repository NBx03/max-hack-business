import { useState, type FormEvent } from 'react';
import { Button, Input, Typography } from '@maxhub/max-ui';
import { useSession } from '../../app/SessionContext';
import { createCompany } from '../../api/onboarding';
import { errorMessage } from '../../api/errors';
import { ErrorText, Hint, OnboardingLayout } from './OnboardingLayout';

const NAME_MAX = 255;

/** ИНН не проверяется, но явная опечатка в формате — повод подсказать до отправки. */
function innProblem(inn: string): string | null {
  if (inn === '') {
    return null;
  }
  return /^(\d{10}|\d{12})$/.test(inn) ? null : 'ИНН — 10 или 12 цифр';
}

/** 2. Создание компании (docs/SCREENS.md). */
export function CreateCompanyScreen({ onBack }: { onBack: () => void }) {
  const { refresh } = useSession();
  const [name, setName] = useState('');
  const [inn, setInn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedInn = inn.replace(/\s+/g, '');
  const innError = innProblem(trimmedInn);
  const canSubmit = trimmedName.length > 0 && innError === null && !busy;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createCompany(trimmedName, trimmedInn === '' ? null : trimmedInn);
      // После создания человек — администратор своей компании: /me отведёт его дальше.
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <OnboardingLayout
      title="Создание компании"
      subtitle="Вы станете администратором и получите роль «Директор». Стандартные роли и маршруты согласования появятся сразу."
      footer={
        <>
          <Button size="large" stretched disabled={!canSubmit} loading={busy} onClick={() => void submit()}>
            Создать
          </Button>
          <Button size="large" variant="ghost" stretched disabled={busy} onClick={onBack}>
            Назад
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Typography.Label variant="medium-strong">Название компании</Typography.Label>
          <Input
            value={name}
            maxLength={NAME_MAX}
            placeholder="ООО «Ромашка»"
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Typography.Label variant="medium-strong">ИНН</Typography.Label>
          <Input
            value={inn}
            inputMode="numeric"
            maxLength={14}
            placeholder="Необязательно"
            onChange={(event) => setInn(event.target.value)}
          />
          {innError ? <ErrorText>{innError}</ErrorText> : <Hint>Необязательно и не проверяется.</Hint>}
        </label>
        {/* Отправка по Enter с клавиатуры телефона. */}
        <button type="submit" hidden aria-hidden />
      </form>
      {error && <ErrorText>{error}</ErrorText>}
    </OnboardingLayout>
  );
}
