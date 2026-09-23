import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { ROUTE_PATTERNS } from './paths';

// Возврат «назад» — один для системной кнопки MAX (useMaxBackButton) и для ссылок «‹ …»
// в шапках экранов (BackLink). Раньше системная кнопка шла по истории браузера, а ссылок
// не было вовсе: из «Приглашения» или карточки нельзя было уйти без кнопки MAX.
//
// Правило: «назад» — это всегда логический родитель экрана (карточка для проверки,
// список для карточки, «Компания» для экранов администрирования). Если родитель — это и
// есть предыдущий экран в истории, делаем шаг назад по истории; иначе заменяем текущий
// экран родителем. Так не бывает петель, когда «назад» после ссылки «‹ Документы»
// возвращал бы на ту же карточку.

/**
 * Логический родитель экрана — чистая функция, покрыта тестом (navigation.test.ts).
 * entryRoute — запасной вариант для путей, у которых родителя нет.
 */
export function parentRoute(pathname: string, entryRoute: string): string {
  if (pathname === ROUTE_PATTERNS.documentUpload) {
    return ROUTE_PATTERNS.documents;
  }
  const documentSubPath = pathname.match(/^(\/documents\/\d+)\/.+$/);
  if (documentSubPath) {
    return documentSubPath[1];
  }
  if (/^\/documents\/\d+$/.test(pathname)) {
    return ROUTE_PATTERNS.documents;
  }
  if (pathname.startsWith('/admin/')) {
    return ROUTE_PATTERNS.company;
  }
  if (pathname === ROUTE_PATTERNS.createCompany || pathname.startsWith(ROUTE_PATTERNS.join)) {
    return ROUTE_PATTERNS.welcome;
  }
  return entryRoute;
}

// Пути внутри приложения в порядке переходов. Живёт на уровне модуля, а не в состоянии:
// роутер пересоздаётся при refresh() сессии, а история переходов при этом остаётся.
const visited: string[] = [];

/** Ведёт стек переходов — вызывается один раз, в AppRoutes. */
export function useTrackVisited(): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    const path = location.pathname;
    if (navigationType === 'PUSH') {
      visited.push(path);
    } else if (navigationType === 'REPLACE' && visited.length > 0) {
      visited[visited.length - 1] = path;
    } else {
      // POP — шаг по истории или первая загрузка страницы.
      const index = visited.lastIndexOf(path);
      if (index >= 0) {
        visited.length = index + 1;
      } else {
        visited.length = 0;
        visited.push(path);
      }
    }
  }, [location.key, location.pathname, navigationType]);
}

/** Функция «вернуться к target»: шаг назад по истории, если target — предыдущий экран. */
export function useGoBack(): (target: string) => void {
  const navigate = useNavigate();
  return useCallback(
    (target: string) => {
      if (visited.length >= 2 && visited[visited.length - 2] === target) {
        navigate(-1);
      } else {
        navigate(target, { replace: true });
      }
    },
    [navigate],
  );
}
