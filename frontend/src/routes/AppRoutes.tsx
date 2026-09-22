import { Navigate, Route, Routes } from 'react-router-dom';
import type { MeResponse } from '../api/types';
import { ROUTE_PATTERNS } from './paths';
import { resolveEntryRoute } from './resolveEntryRoute';
import { ScreenStub } from './ScreenStub';
import { WelcomeStub } from './WelcomeStub';

/**
 * Маршрутизация по ответу /me и startParam (#53) - см. docs/SCREENS.md, "Навигация".
 * Сами экраны - заглушки с названиями, вёрстка каждого - отдельные задачи (#1, #7, #18).
 */
export function AppRoutes({ me }: { me: MeResponse }) {
  const entryRoute = resolveEntryRoute(me);

  return (
    <Routes>
      <Route path="/" element={<Navigate to={entryRoute} replace />} />
      <Route path={ROUTE_PATTERNS.welcome} element={<WelcomeStub />} />
      <Route path={ROUTE_PATTERNS.createCompany} element={<ScreenStub title="2. Создание компании" issue="#1, #7" />} />
      <Route path={ROUTE_PATTERNS.adminInvite} element={<ScreenStub title="3. Приглашение" issue="#7" />} />
      <Route path={ROUTE_PATTERNS.join} element={<ScreenStub title="4. Присоединение по коду" issue="#1, #7" />} />
      <Route
        path={ROUTE_PATTERNS.joinPersonal}
        element={<ScreenStub title="4б. Вступление по личной ссылке" issue="#7" />}
      />
      <Route path={ROUTE_PATTERNS.pending} element={<ScreenStub title="5. Ожидание решения" issue="#1, #7" />} />
      <Route path={ROUTE_PATTERNS.adminRequests} element={<ScreenStub title="6. Заявки" issue="#7" />} />
      <Route path={ROUTE_PATTERNS.adminMembers} element={<ScreenStub title="7. Участники" issue="#7" />} />
      <Route path={ROUTE_PATTERNS.documents} element={<ScreenStub title="8. Список документов" issue="#18" />} />
      <Route path={ROUTE_PATTERNS.documentUpload} element={<ScreenStub title="9. Загрузка документа" issue="#18" />} />
      <Route path={ROUTE_PATTERNS.documentCheck} element={<ScreenStub title="10. Результат проверки" issue="#18" />} />
      <Route path={ROUTE_PATTERNS.documentCard} element={<ScreenStub title="11. Карточка документа" issue="#18" />} />
      <Route path={ROUTE_PATTERNS.routePreview} element={<ScreenStub title="12. Предпросмотр маршрута" issue="#18" />} />
      {/* Неизвестный путь - не 404, а туда же, куда привело бы свежее /me. */}
      <Route path="*" element={<Navigate to={entryRoute} replace />} />
    </Routes>
  );
}
