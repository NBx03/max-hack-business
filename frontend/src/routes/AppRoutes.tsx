import { useEffect, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { MeResponse } from '../api/types';
import {
  CreateCompanyRoute,
  JoinRoute,
  PendingRoute,
  PersonalInviteRoute,
  WelcomeRoute,
} from '../screens/onboarding/OnboardingRoutes';
import { DocumentCardScreen } from '../screens/documents/DocumentCardScreen';
import { DocumentListScreen } from '../screens/documents/DocumentListScreen';
import { RoutePreviewScreen } from '../screens/documents/RoutePreviewScreen';
import { ROUTE_PATTERNS } from './paths';
import { guardTarget, type GuardKind } from './guards';
import { resolveEntryRoute } from './resolveEntryRoute';
import { DocumentCheckScreen } from '../screens/documents/DocumentCheckScreen';
import { DocumentUploadScreen } from '../screens/documents/DocumentUploadScreen';
import { NewDocumentVersionScreen } from '../screens/documents/NewDocumentVersionScreen';
import { InviteScreen } from '../screens/admin/InviteScreen';
import { JoinRequestsScreen } from '../screens/admin/JoinRequestsScreen';
import { MembersScreen } from '../screens/admin/MembersScreen';
import { useMaxBackButton } from './useMaxBackButton';

/** Параметр запуска уже отработал в этом запуске приложения (см. AppRoutes). */
let startParamUsed = false;

/**
 * Маршрутизация по ответу /me и startParam (#53) - см. docs/SCREENS.md, "Навигация".
 * Экраны подключения - #18, администрирования - #54, документов - #7 и #55.
 */
export function AppRoutes({ me }: { me: MeResponse }) {
  // startParam действует один раз за запуск: он приходит в каждом /me, и без этой отметки
  // любой переход на "/" (кнопка "К списку", выход из демо, отмена заявки) снова открывал
  // бы документ или приглашение из ссылки. Первый уход с "/" - это и есть переход по ссылке.
  // Отметка живёт на уровне модуля, а не в состоянии компонента: refresh() в SessionContext
  // показывает общий спиннер и пересоздаёт роутер, и состояние сбросилось бы - после отмены
  // заявки или выхода из демо человека снова отбросило бы на экран из ссылки.
  const location = useLocation();
  useEffect(() => {
    if (location.pathname !== '/') {
      startParamUsed = true;
    }
  }, [location.pathname]);

  const entryRoute = resolveEntryRoute(me, !startParamUsed);

  // Системная BackButton моста - вне MAX (обычный браузер, локальная разработка) не
  // делает ничего: getWebApp()?.BackButton внутри хука не находит объект и выходит.
  useMaxBackButton(entryRoute);

  const guarded = (kind: GuardKind) => (element: ReactElement): ReactElement => {
    const target = guardTarget(kind, me, entryRoute);
    return target === null ? element : <Navigate to={target} replace />;
  };
  const onboardingScreen = guarded('onboarding');
  const pendingScreen = guarded('pending');
  const companyScreen = guarded('company');

  return (
    <Routes>
      <Route path="/" element={<Navigate to={entryRoute} replace />} />
      <Route path={ROUTE_PATTERNS.welcome} element={onboardingScreen(<WelcomeRoute />)} />
      <Route
        path={ROUTE_PATTERNS.createCompany}
        element={guarded('createCompany')(<CreateCompanyRoute />)}
      />
      <Route
        path={ROUTE_PATTERNS.adminInvite}
        element={companyScreen(<InviteScreen />)}
      />
      <Route
        path={ROUTE_PATTERNS.join}
        element={onboardingScreen(<JoinRoute />)}
      />
      <Route
        path={ROUTE_PATTERNS.joinPersonal}
        element={onboardingScreen(<PersonalInviteRoute />)}
      />
      <Route
        path={ROUTE_PATTERNS.pending}
        element={pendingScreen(<PendingRoute />)}
      />
      <Route
        path={ROUTE_PATTERNS.adminRequests}
        element={companyScreen(<JoinRequestsScreen />)}
      />
      <Route
        path={ROUTE_PATTERNS.adminMembers}
        element={companyScreen(<MembersScreen />)}
      />
      <Route path={ROUTE_PATTERNS.documents} element={companyScreen(<DocumentListScreen />)} />
      <Route
        path={ROUTE_PATTERNS.documentUpload}
        element={companyScreen(<DocumentUploadScreen />)}
      />
      <Route
        path={ROUTE_PATTERNS.documentCheck}
        element={companyScreen(<DocumentCheckScreen />)}
      />
      <Route
        path={ROUTE_PATTERNS.documentNewVersion}
        element={companyScreen(<NewDocumentVersionScreen />)}
      />
      <Route path={ROUTE_PATTERNS.documentCard} element={<DocumentCardScreen />} />
      <Route path={ROUTE_PATTERNS.routePreview} element={companyScreen(<RoutePreviewScreen />)} />
      {/* Неизвестный путь - не 404, а туда же, куда привело бы свежее /me. */}
      <Route path="*" element={<Navigate to={entryRoute} replace />} />
    </Routes>
  );
}
