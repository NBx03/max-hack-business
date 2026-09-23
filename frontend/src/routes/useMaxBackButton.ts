import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getWebApp, isInsideMax, type MaxBackButton } from '../max/webApp';
import { ROOT_ROUTE_PATTERNS, ROUTE_PATTERNS } from './paths';

// isInsideMax(), не просто наличие window.WebApp - тот же признак, что уже использует
// downloadFile() (max/webApp.ts): скрипт моста грузится в index.html безусловно, поэтому
// объект существует и в обычном браузере вне MAX, где его методы ничего не делают.
function activeBackButton(): MaxBackButton | null {
  return isInsideMax() ? (getWebApp()?.BackButton ?? null) : null;
}

// Системная BackButton моста (show/hide/onClick/offClick - dev.max.ru/docs/webapps/bridge),
// один хук в каркасе вместо ручной проводки в каждом экране (PR #71, ревью).

/**
 * Родитель для случая без истории внутри приложения - в первую очередь вход по
 * d_<id> из уведомления бота прямо на карточку документа, где React Router
 * ничего не помнит. Остальные некорневые экраны обычно открыты кликом изнутри
 * приложения, там сработает navigate(-1), а entryRoute - запасной вариант.
 */
function parentPath(pathname: string, entryRoute: string): string {
  const documentSubPath = pathname.match(/^(\/documents\/\d+)\/.+$/);
  if (documentSubPath) {
    return documentSubPath[1];
  }
  if (/^\/documents\/\d+$/.test(pathname)) {
    return ROUTE_PATTERNS.documents;
  }
  if (pathname.startsWith('/admin/')) {
    return ROUTE_PATTERNS.documents;
  }
  return entryRoute;
}

export function useMaxBackButton(entryRoute: string): void {
  const location = useLocation();
  const navigate = useNavigate();

  // Последний путь и entryRoute - в ref, чтобы не переподписывать onClick моста
  // на каждый переход (см. components/base/Toast.tsx, тот же приём с onDismissRef).
  const latest = useRef({ pathname: location.pathname, entryRoute });
  latest.current = { pathname: location.pathname, entryRoute };

  useEffect(() => {
    const backButton = activeBackButton();
    if (!backButton) {
      return;
    }
    if (ROOT_ROUTE_PATTERNS.has(location.pathname)) {
      backButton.hide();
    } else {
      backButton.show();
    }
  }, [location.pathname]);

  useEffect(() => {
    const backButton = activeBackButton();
    if (!backButton) {
      return;
    }
    function handleClick() {
      const { pathname, entryRoute } = latest.current;
      const historyState = window.history.state as { idx?: number } | null;
      if (typeof historyState?.idx === 'number' && historyState.idx > 0) {
        navigate(-1);
      } else {
        navigate(parentPath(pathname, entryRoute), { replace: true });
      }
    }
    backButton.onClick(handleClick);
    return () => backButton.offClick(handleClick);
  }, [navigate]);
}
