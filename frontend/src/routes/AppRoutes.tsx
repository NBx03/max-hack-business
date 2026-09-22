import { useEffect, useState, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { MeResponse } from '../api/types';
import {
  CreateCompanyRoute,
  JoinRoute,
  PendingRoute,
  PersonalInviteRoute,
  WelcomeRoute,
} from '../screens/onboarding/OnboardingRoutes';
import { ROUTE_PATTERNS } from './paths';
import { hasCompany, resolveEntryRoute } from './resolveEntryRoute';
import { ScreenStub } from './ScreenStub';
import { DocumentCheckScreen } from '../screens/documents/DocumentCheckScreen';
import { DocumentUploadScreen } from '../screens/documents/DocumentUploadScreen';
import { NewDocumentVersionScreen } from '../screens/documents/NewDocumentVersionScreen';

/**
 * Маршрутизация по ответу /me и startParam (#53) - см. docs/SCREENS.md, "Навигация".
 * Экраны подключения - #18, документов - #55, остальные пока заглушки (#54, #7).
 */
export function AppRoutes({ me }: { me: MeResponse }) {
  // startParam действует один раз за запуск: он приходит в каждом /me, и без этой отметки
  // любой переход на "/" (кнопка "К списку", выход из демо, отмена заявки) снова открывал
  // бы документ или приглашение из ссылки. Первый уход с "/" - это и есть переход по ссылке.
  const location = useLocation();
  const [startParamUsed, setStartParamUsed] = useState(false);
  useEffect(() => {
    if (location.pathname !== '/') {
      setStartParamUsed(true);
    }
  }, [location.pathname]);

  const entryRoute = resolveEntryRoute(me, !startParamUsed);
  const companyReady = hasCompany(me);
  const pending = Boolean(me.pendingJoinRequest);

  // Экраны 1-4 (приветствие, создание, код, личная ссылка) - только пока нет компании
  // и заявки. Свежий /me проверяется на каждом рендере: как только компания появляется
  // (создали, вступили, открыли демо) или подана заявка, человека уводит с экрана сам
  // роутер - экрану достаточно вызвать refresh().
  function onboardingScreen(element: ReactElement): ReactElement {
    if (companyReady) return <Navigate to={ROUTE_PATTERNS.documents} replace />;
    if (pending) return <Navigate to={ROUTE_PATTERNS.pending} replace />;
    return element;
  }

  // 5. Ожидание решения - только пока заявка висит. Одобрили - к документам,
  // отменили или отклонили - туда, куда ведёт свежий /me (приветствие).
  function pendingScreen(element: ReactElement): ReactElement {
    if (companyReady) return <Navigate to={ROUTE_PATTERNS.documents} replace />;
    if (!pending) return <Navigate to={entryRoute} replace />;
    return element;
  }

  // Документы и админка - только при компании. Карточка документа (documentCard) -
  // исключение и здесь не участвует: на неё ведёт d_<id> из уведомления бота
  // независимо от companyReady, а доступ проверяет сам экран через GET /documents/{id}
  // (см. resolveEntryRoute). Если бы карточка тоже требовала companyReady, человека
  // без компании после d_<id> зациклило бы: entryRoute снова укажет на неё же.
  function companyScreen(element: ReactElement): ReactElement {
    return companyReady ? element : <Navigate to={entryRoute} replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={entryRoute} replace />} />
      <Route path={ROUTE_PATTERNS.welcome} element={onboardingScreen(<WelcomeRoute />)} />
      <Route
        path={ROUTE_PATTERNS.createCompany}
        element={onboardingScreen(<CreateCompanyRoute />)}
      />
      <Route
        path={ROUTE_PATTERNS.adminInvite}
        element={companyScreen(<ScreenStub title="3. Приглашение" issue="#54" />)}
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
        element={companyScreen(<ScreenStub title="6. Заявки" issue="#54" />)}
      />
      <Route
        path={ROUTE_PATTERNS.adminMembers}
        element={companyScreen(<ScreenStub title="7. Участники" issue="#54" />)}
      />
      <Route
        path={ROUTE_PATTERNS.documents}
        element={companyScreen(<ScreenStub title="8. Список документов" issue="#7" />)}
      />
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
      <Route path={ROUTE_PATTERNS.documentCard} element={<ScreenStub title="11. Карточка документа" issue="#7" />} />
      <Route
        path={ROUTE_PATTERNS.routePreview}
        element={companyScreen(<ScreenStub title="12. Предпросмотр маршрута" issue="#7" />)}
      />
      {/* Неизвестный путь - не 404, а туда же, куда привело бы свежее /me. */}
      <Route path="*" element={<Navigate to={entryRoute} replace />} />
    </Routes>
  );
}
