import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/errors';
import { Tabs } from '../../components/base/Tabs';
import { AccessErrorState, ErrorState } from '../../components/base/StateCard';
import { ROUTE_PATTERNS } from '../../routes/paths';

// Общая шапка для экранов 3/6/7 (docs/SCREENS.md, "Подключение компании"). Своего меню
// администратора (со счётчиком заявок - экран 8) ещё нет: список документов - отдельная
// задача (#7). Пока переход между тремя экранами администратора - только отсюда.

export const FALLBACK_ERROR = 'Сервис временно недоступен, попробуйте ещё раз';

/**
 * Ошибка первой загрузки экрана. 403 (не ADMIN) - не временный сбой, «Повторить» здесь
 * никогда не поможет: показываем AccessErrorState со ссылкой на документы (PR #72, ревью
 * №5). Раздел открыт по прямому адресу и без вкладки «Админ» (#71, только для ADMIN).
 */
export function AdminLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const navigate = useNavigate();
  if (error instanceof ApiError && error.status === 403) {
    return (
      <AccessErrorState
        text="Раздел доступен администраторам компании"
        actionLabel="К документам"
        onAction={() => navigate(ROUTE_PATTERNS.documents)}
      />
    );
  }
  return (
    <ErrorState message={error instanceof ApiError ? error.message : FALLBACK_ERROR} onRetry={onRetry} />
  );
}

type AdminTabKey = 'invite' | 'requests' | 'members';

const TAB_PATH: Record<AdminTabKey, string> = {
  invite: ROUTE_PATTERNS.adminInvite,
  requests: ROUTE_PATTERNS.adminRequests,
  members: ROUTE_PATTERNS.adminMembers,
};

export function AdminTabs({ active, requestsCount }: { active: AdminTabKey; requestsCount?: number }) {
  const navigate = useNavigate();
  return (
    <Tabs
      tabs={[
        { key: 'invite', label: 'Приглашение' },
        { key: 'requests', label: 'Заявки', count: requestsCount },
        { key: 'members', label: 'Участники' },
      ]}
      activeKey={active}
      onChange={(key) => navigate(TAB_PATH[key])}
    />
  );
}

/** «когда подана» / срок действия ссылки - коротко и по-русски, без библиотеки дат. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(date);
}

/** Личные ссылки живут 72 часа (CLAUDE.md) - «осталось» понятнее, чем абсолютная дата истечения. */
export function formatTimeLeft(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diffMs)) {
    return iso;
  }
  if (diffMs <= 0) {
    return 'истекает';
  }
  const hours = Math.round(diffMs / (60 * 60 * 1000));
  if (hours < 1) {
    return 'осталось меньше часа';
  }
  if (hours < 24) {
    return `осталось ${hours} ч`;
  }
  return `осталось ${Math.round(hours / 24)} дн.`;
}

export function roleNames(roles: { name: string }[]): string {
  return roles.length > 0 ? roles.map((role) => role.name).join(', ') : 'Без ролей';
}
