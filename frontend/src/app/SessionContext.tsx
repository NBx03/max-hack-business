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
import { ApiError } from '../api/errors';
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
  /** Создаёт песочницу или пересоздаёт её ("Начать заново"). */
  startSandbox: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) {
    return err;
  }
  return new ApiError(0, {
    code: 'UNKNOWN',
    message: 'Сервис временно недоступен, попробуйте ещё раз',
  });
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
      const response = await getMe();
      setMe(response);
      setStatus('ready');
      if (response.sandbox) {
        try {
          const sandbox = await getDemoSandbox();
          setSandboxUsers(sandbox.users);
        } catch {
          setSandboxUsers(null);
        }
      } else {
        setSandboxUsers(null);
      }
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

  const startSandbox = useCallback(async () => {
    // Прежние id участников после пересоздания недействительны (403) - сбрасываем сразу.
    setActingAsId(null);
    const sandbox = await createDemoSandbox();
    setSandboxUsers(sandbox.users);
    await refresh();
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
