import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { MeResponse } from '../api/types';
import { DocumentCardScreen } from '../screens/documents/DocumentCardScreen';
import { DocumentListScreen } from '../screens/documents/DocumentListScreen';
import { RoutePreviewScreen } from '../screens/documents/RoutePreviewScreen';
import { ROUTE_PATTERNS } from './paths';
import { hasCompany, resolveEntryRoute } from './resolveEntryRoute';
import { ScreenStub } from './ScreenStub';
import { WelcomeStub } from './WelcomeStub';
import { DocumentCheckScreen } from '../screens/documents/DocumentCheckScreen';
import { DocumentUploadScreen } from '../screens/documents/DocumentUploadScreen';
import { NewDocumentVersionScreen } from '../screens/documents/NewDocumentVersionScreen';
import { InviteScreen } from '../screens/admin/InviteScreen';
import { JoinRequestsScreen } from '../screens/admin/JoinRequestsScreen';
import { MembersScreen } from '../screens/admin/MembersScreen';
import { useMaxBackButton } from './useMaxBackButton';

/**
 * Маршрутизация по ответу /me и startParam (#53) - см. docs/SCREENS.md, "Навигация".
 * Сами экраны - заглушки с названиями, вёрстка каждого - отдельные задачи (#18, #54, #7, #55).
 */
export function AppRoutes({ me }: { me: MeResponse }) {
  const entryRoute = resolveEntryRoute(me);
  const companyReady = hasCompany(me);

  // Системная BackButton моста - вне MAX (обычный браузер, локальная разработка) не
  // делает ничего: getWebApp()?.BackButton внутри хука не находит объект и выходит.
  useMaxBackButton(entryRoute);

  // Экраны 1-5 (приветствие, создание, код, личная ссылка, ожидание) - только пока
  // компании нет. Свежий /me проверяется на каждом рендере, а не только при входе на
  // "/": как только компания появляется (создали, вступили, открыли демо), человека
  // уводит со экрана онбординга без ручного navigate() в каждом обработчике.
  function onboardingScreen(element: ReactElement): ReactElement {
    return companyReady ? <Navigate to={ROUTE_PATTERNS.documents} replace /> : element;
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
      <Route path={ROUTE_PATTERNS.welcome} element={onboardingScreen(<WelcomeStub />)} />
      <Route
        path={ROUTE_PATTERNS.createCompany}
        element={onboardingScreen(<ScreenStub title="2. Создание компании" issue="#18" />)}
      />
      <Route
        path={ROUTE_PATTERNS.adminInvite}
        element={companyScreen(<InviteScreen />)}
      />
      <Route
        path={ROUTE_PATTERNS.join}
        element={onboardingScreen(<ScreenStub title="4. Присоединение по коду" issue="#18" />)}
      />
      <Route
        path={ROUTE_PATTERNS.joinPersonal}
        element={onboardingScreen(<ScreenStub title="4б. Вступление по личной ссылке" issue="#18" />)}
      />
      <Route
        path={ROUTE_PATTERNS.pending}
        element={onboardingScreen(<ScreenStub title="5. Ожидание решения" issue="#18" />)}
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
