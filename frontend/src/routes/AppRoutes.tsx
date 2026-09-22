import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { MeResponse } from '../api/types';
import { ROUTE_PATTERNS } from './paths';
import { hasCompany, resolveEntryRoute } from './resolveEntryRoute';
import { ScreenStub } from './ScreenStub';
import { WelcomeStub } from './WelcomeStub';
import { DocumentCheckScreen } from '../screens/documents/DocumentCheckScreen';
import { DocumentUploadScreen } from '../screens/documents/DocumentUploadScreen';
import { NewDocumentVersionScreen } from '../screens/documents/NewDocumentVersionScreen';

/**
 * Маршрутизация по ответу /me и startParam (#53) - см. docs/SCREENS.md, "Навигация".
 * Сами экраны - заглушки с названиями, вёрстка каждого - отдельные задачи (#18, #54, #7, #55).
 */
export function AppRoutes({ me }: { me: MeResponse }) {
  const entryRoute = resolveEntryRoute(me);
  const companyReady = hasCompany(me);

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
        element={companyScreen(<ScreenStub title="3. Приглашение" issue="#54" />)}
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
