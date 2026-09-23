import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setActingAsId } from '../api/client';
import { ApiError, GENERIC_ERROR_MESSAGE } from '../api/errors';
import { createDemoSandbox, getDemoSandbox, getMe } from '../api/session';
import type { DemoSandboxUser, MeResponse } from '../api/types';

type SessionStatus = 'loading' | 'ready' | 'error';

interface SessionValue {
  status: SessionStatus;
  me: MeResponse | null;
  error: ApiError | null;
  /** null - демо-режим выключен или песочница ещё не создана. */
  sandboxUsers: DemoSandboxUser[] | null;
  refresh: () => Promise<void>;
  /** id участника своей песочницы, или null, чтобы выйти из демо. */
  actAs: (userId: number | null) => Promise<void>;
  /**
   * Создаёт песочницу или пересоздаёт её ("Начать заново"). Возвращает её участников,
   * чтобы сразу войти от имени одного из них; null - не получилось, ошибка уже в `error`.
   */
  startSandbox: () => Promise<DemoSandboxUser[]>;
}

const SessionContext = createContext<SessionValue | null>(null);

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) {
    return err;
  }
  return new ApiError(0, {
    code: 'UNKNOWN',
    message: GENERIC_ERROR_MESSAGE,
  });
}

/**
 * X-Demo-Act-As мог протухнуть без нашего ведома - песочницу пересоздали
 * в другой вкладке или бэкенд перезапустили. Без восстановления пользователь
 * залипает: 403 DEMO_ACT_AS_FORBIDDEN на каждый /me, а "Повторить" шлёт тот
 * же протухший заголовок снова, и выйти из демо нечем - DemoSwitcher не
 * рендерится на экране ошибки. Поэтому один раз сбрасываем заголовок и
 * повторяем запрос от имени реальной компании / экрана приветствия.
 */
async function getMeWithDemoRecovery(): Promise<MeResponse> {
  try {
    return await getMe();
  } catch (err) {
    if (err instanceof ApiError && err.code === 'DEMO_ACT_AS_FORBIDDEN') {
      setActingAsId(null);
      return await getMe();
    }
    throw err;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [sandboxUsers, setSandboxUsers] = useState<DemoSandboxUser[] | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const response = await getMeWithDemoRecovery();
      // Участники существующей песочницы загружаются до перехода в ready: иначе экран
      // приветствия успел бы увидеть sandboxUsers = null, решить, что песочницы нет,
      // и кнопка «Открыть демо» пересоздала бы её, стерев прогресс проверяющего.
      // Сбой этой загрузки — общая ошибка с «Повторить», а не «песочницы нет».
      const users = response.sandbox ? (await getDemoSandbox()).users : null;
      setMe(response);
      setSandboxUsers(users);
      setStatus('ready');
    } catch (err) {
      setError(toApiError(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const actAs = useCallback(
    async (userId: number | null) => {
      setActingAsId(userId);
      await refresh();
    },
    [refresh],
  );

  // Ошибку создания бросает вызывающему: экран приветствия показывает её у своей кнопки.
  const startSandbox = useCallback(async () => {
    // Прежние id участников после пересоздания недействительны (403) - сбрасываем сразу.
    setActingAsId(null);
    const sandbox = await createDemoSandbox();
    await refresh();
    return sandbox.users;
  }, [refresh]);

  const value = useMemo<SessionValue>(
    () => ({ status, me, error, sandboxUsers, refresh, actAs, startSandbox }),
    [status, me, error, sandboxUsers, refresh, actAs, startSandbox],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession должен использоваться внутри SessionProvider');
  }
  return ctx;
}
