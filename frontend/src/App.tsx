import { Spinner } from '@maxhub/max-ui';
import { BrowserRouter } from 'react-router-dom';
import { useSession } from './app/SessionContext';
import { GENERIC_ERROR_MESSAGE } from './api/errors';
import { DemoSwitcher } from './components/base/DemoSwitcher';
import { FullscreenCenter } from './components/base/Layout';
import { ErrorState } from './components/base/StateCard';
import { AppRoutes } from './routes/AppRoutes';

/**
 * Каркас: подключение к MAX и бэкенду (#6) и общие компоненты (#53) сделаны,
 * сами экраны - отдельные задачи (#1, #7, #18). Ниже - переход к нужному экрану
 * по результату GET /me и демо-переключатель.
 */
export function App() {
  const { status, me, error, refresh } = useSession();

  if (status === 'loading') {
    return (
      <FullscreenCenter>
        <Spinner />
      </FullscreenCenter>
    );
  }

  if (status === 'error' || !me) {
    return (
      <FullscreenCenter>
        <ErrorState
          message={error?.message ?? GENERIC_ERROR_MESSAGE}
          onRetry={() => void refresh()}
        />
      </FullscreenCenter>
    );
  }

  // Ключ - от чьего имени идёт работа: при смене участника демо (тихое обновление /me, без
  // общего спиннера) экраны пересоздаются и заново загружают свои данные уже для него.
  const actorKey = me.actingAs ? `demo-${me.actingAs.user.id}` : `user-${me.user.id}`;

  return (
    <BrowserRouter>
      <DemoSwitcher />
      <AppRoutes key={actorKey} me={me} />
    </BrowserRouter>
  );
}
