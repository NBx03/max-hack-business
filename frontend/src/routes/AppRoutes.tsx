import { useEffect, useState, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { MeResponse } from '../api/types';
import { isLaunchHandled, markLaunchHandled } from '../app/launch';
import {
  CreateCompanyRoute,
  JoinRoute,
  PendingRoute,
  PersonalInviteRoute,
  WelcomeRoute,
} from '../screens/onboarding/OnboardingRoutes';
import { CompanyScreen } from '../screens/company/CompanyScreen';
import { RulesScreen } from '../screens/company/RulesScreen';
import { DocumentCardScreen } from '../screens/documents/DocumentCardScreen';
import { DocumentListScreen } from '../screens/documents/DocumentListScreen';
import { RoutePreviewScreen } from '../screens/documents/RoutePreviewScreen';
import { ROUTE_PATTERNS } from './paths';
import { guardTarget, type GuardKind } from './guards';
import { resolveEntryRoute } from './resolveEntryRoute';
import { DocumentCheckScreen } from '../screens/documents/DocumentCheckScreen';
import { DocumentUploadScreen } from '../screens/documents/DocumentUploadScreen';
import { MemoFormScreen } from '../screens/documents/MemoFormScreen';
import { NewDocumentVersionScreen } from '../screens/documents/NewDocumentVersionScreen';
import { InviteScreen } from '../screens/admin/InviteScreen';
import { JoinRequestsScreen } from '../screens/admin/JoinRequestsScreen';
import { MembersScreen } from '../screens/admin/MembersScreen';
import { useMaxBackButton } from './useMaxBackButton';

/**
 * Маршрутизация по ответу /me и startParam (#53) - см. docs/SCREENS.md, "Навигация".
 * Экраны подключения - #18, администрирования - #54, документов - #7 и #55.
 */
export function AppRoutes({ me }: { me: MeResponse }) {
  const location = useLocation();
  const navigate = useNavigate();

  // startParam действует один раз за запуск (app/launch.ts): он приходит в каждом /me, и без
  // этой отметки любой переход на "/" (выход из демо, отмена заявки) снова открывал бы документ
  // или приглашение из ссылки. Запуск узнаём по его данным, а не по пути: при повторном открытии
  // из бота MAX может перезагрузить страницу на прежнем экране, а не на "/".
  const [startParamPending, setStartParamPending] = useState(() => !isLaunchHandled() && Boolean(me.startParam));
  const entryRoute = resolveEntryRoute(me, startParamPending);

  useEffect(() => {
    if (!startParamPending) {
      return;
    }
    markLaunchHandled();
    // На "/" переход сделает <Navigate> ниже. На любом другом пути (страница перезагружена
    // повторным открытием из бота) ведём по ссылке сами.
    if (location.pathname !== '/' && location.pathname !== entryRoute) {
      navigate(entryRoute, { replace: true });
    }
    // Дальше entryRoute - уже без ссылки: охранники и «назад» ведут в обычные места.
    setStartParamPending(false);
    // Только при первом монтировании: дальше startParam уже отработал.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <Route path={ROUTE_PATTERNS.company} element={companyScreen(<CompanyScreen />)} />
      <Route path={ROUTE_PATTERNS.companyRules} element={companyScreen(<RulesScreen />)} />
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
      <Route path={ROUTE_PATTERNS.memoForm} element={companyScreen(<MemoFormScreen />)} />
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
