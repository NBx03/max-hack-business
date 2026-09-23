import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getWebApp, isInsideMax, type MaxBackButton } from '../max/webApp';
import { parentRoute, useGoBack } from './backNavigation';
import { ROOT_ROUTE_PATTERNS } from './paths';

// isInsideMax(), не просто наличие window.WebApp - тот же признак, что уже использует
// downloadFile() (max/webApp.ts): скрипт моста грузится в index.html безусловно, поэтому
// объект существует и в обычном браузере вне MAX, где его методы ничего не делают.
function activeBackButton(): MaxBackButton | null {
  return isInsideMax() ? (getWebApp()?.BackButton ?? null) : null;
}

// Системная BackButton моста (show/hide/onClick/offClick - dev.max.ru/docs/webapps/bridge),
// один хук в каркасе вместо ручной проводки в каждом экране (PR #71, ревью). Куда вести -
// та же логика, что у ссылок «‹ …» в шапках экранов (routes/backNavigation.ts).
export function useMaxBackButton(entryRoute: string): void {
  const location = useLocation();
  const goBack = useGoBack();

  // Последний путь и entryRoute - в ref, чтобы не переподписывать onClick моста
  // на каждый переход (см. components/base/Toast.tsx, тот же приём с onDismissRef).
  const latest = useRef({ pathname: location.pathname, entryRoute, goBack });
  latest.current = { pathname: location.pathname, entryRoute, goBack };

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
      const { pathname, entryRoute, goBack } = latest.current;
      goBack(parentRoute(pathname, entryRoute));
    }
    backButton.onClick(handleClick);
    return () => backButton.offClick(handleClick);
  }, []);
}
