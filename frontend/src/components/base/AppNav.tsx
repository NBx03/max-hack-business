import { useEffect, useState, type ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { getPendingJoinRequestsCount } from '../../api/organization';
import { ROUTE_PATTERNS } from '../../routes/paths';
import { CountBadge } from './Tabs';

// Нижнее меню разделов: «Документы» и «Компания». Без него после создания компании человек
// попадал на «Приглашение» и не видел пути к документам, а из экранов администрирования
// выходил только системной кнопкой MAX (тест 23.09). Показывается на корневых экранах
// разделов и экранах администрирования; на экранах одного документа — ссылка «‹ …» в шапке.

type Section = 'documents' | 'company';

function sectionOf(pathname: string): Section {
  return pathname === ROUTE_PATTERNS.company || pathname.startsWith('/admin/') ? 'company' : 'documents';
}

function DocumentsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 3h7l5 5v13H7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 3v5h5M10 13h6M10 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CompanyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 21V5l8-2v18M12 8l8 2v11M3 21h18" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 8v.01M8 12v.01M8 16v.01M16 13v.01M16 17v.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function AppNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { me } = useSession();
  const active = sectionOf(location.pathname);
  const isAdmin = Boolean(me?.actingAs ? me.actingAs.isAdmin : me?.membership?.isAdmin);
  const [pendingRequests, setPendingRequests] = useState(0);

  // Счётчик заявок — чтобы администратор видел новые заявки из любого раздела. Сбой
  // запроса не мешает навигации: просто нет счётчика.
  useEffect(() => {
    if (!isAdmin) {
      setPendingRequests(0);
      return;
    }
    let cancelled = false;
    getPendingJoinRequestsCount()
      .then((count) => {
        if (!cancelled) setPendingRequests(count);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAdmin, location.pathname]);

  const items: { key: Section; label: string; to: string; icon: ReactElement; badge?: number }[] = [
    { key: 'documents', label: 'Документы', to: ROUTE_PATTERNS.documents, icon: <DocumentsIcon /> },
    { key: 'company', label: 'Компания', to: ROUTE_PATTERNS.company, icon: <CompanyIcon />, badge: pendingRequests },
  ];

  return (
    <nav
      aria-label="Разделы"
      style={{
        display: 'flex',
        borderTop: '1px solid var(--divider-primary)',
        background: 'var(--background-primary)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            // Повторное нажатие на активный раздел возвращает к его корню (с экрана
            // «Участники» — на «Компанию»), как в нижних меню мобильных приложений.
            onClick={() => {
              if (location.pathname !== item.to) navigate(item.to);
            }}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '6px 0',
              border: 'none',
              background: 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontSize: 12,
              lineHeight: '16px',
              fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
            }}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              {item.icon}
              {!!item.badge && (
                <span style={{ position: 'absolute', top: -6, right: -14 }}>
                  <CountBadge count={item.badge} />
                </span>
              )}
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
