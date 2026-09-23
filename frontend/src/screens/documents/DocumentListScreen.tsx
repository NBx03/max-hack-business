import { useEffect, useMemo, useState } from 'react';
import { Button, CellList, CellSimple, Input, Spinner, Typography } from '@maxhub/max-ui';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { getDocuments, getDocumentTypes, type DocumentTab, type DocumentListFilters } from '../../api/documents';
import { errorMessage } from '../../api/errors';
import { getPendingJoinRequestsCount } from '../../api/organization';
import type { DocumentListItem, DocumentStatus, DocumentType, UserRef } from '../../api/types';
import { BottomSheet } from '../../components/base/BottomSheet';
import { BottomActionBar, CenteredColumn, ScreenShell } from '../../components/base/Layout';
import { DocumentStatusBadge } from '../../components/base/StatusBadge';
import { CountBadge, Tabs, type TabItem } from '../../components/base/Tabs';
import { EmptyState, ErrorState } from '../../components/base/StateCard';
import { documentStatusMeta } from '../../theme/status';
import { useAsync } from '../../hooks/useAsync';
import { ROUTE_PATTERNS, documentCardPath } from '../../routes/paths';

const STATUS_OPTIONS: DocumentStatus[] = ['DRAFT', 'IN_APPROVAL', 'RETURNED', 'REJECTED', 'APPROVED'];

const TAB_EMPTY_TEXT: Record<DocumentTab, string> = {
  WAITING_ME: 'Ничего не ждёт вашего решения',
  MINE: 'Документов пока нет',
  AVAILABLE: 'Нет доступных документов',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysWaiting(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/** "день"/"дня"/"дней" - обычные русские правила (11-14 всегда "дней"). */
function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
  return 'дней';
}

function waitingText(iso: string): string {
  const days = daysWaiting(iso);
  return days === 0 ? 'ждёт с сегодня' : `ждёт ${days} ${pluralDays(days)}`;
}

type ScreenTab = DocumentTab | 'ADMIN';

/** 8. Список документов - главный экран, плюс вход в 6/7/3 через вкладку "Админ" (docs/SCREENS.md). */
export function DocumentListScreen() {
  const navigate = useNavigate();
  const { me } = useSession();
  const isAdmin = Boolean(me?.actingAs ? me.actingAs.isAdmin : me?.membership?.isAdmin);
  const [tab, setTab] = useState<ScreenTab>('WAITING_ME');
  const [filters, setFilters] = useState<DocumentListFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Известные авторы - накапливаются из уже загруженных документов, отдельного
  // эндпоинта "все авторы" для не-админа нет (GET /orgs/current/members - только ADMIN).
  const [knownAuthors, setKnownAuthors] = useState<Map<number, UserRef>>(new Map());

  // "ADMIN" - не документная вкладка, а отдельный экран-меню; списку документов
  // подсовываем валидную вкладку, чтобы не городить условный вызов хука.
  const docTab: DocumentTab = tab === 'ADMIN' ? 'WAITING_ME' : tab;
  const listQuery = useAsync(() => getDocuments(docTab, { ...filters, size: 50 }), [docTab, filters]);
  // "Ждут меня" со счётчиком - total отдельного запроса с size=1, независимо от фильтров текущей вкладки.
  const waitingCountQuery = useAsync(() => getDocuments('WAITING_ME', { size: 1 }), []);
  const typesQuery = useAsync(() => getDocumentTypes(), []);
  const pendingRequestsQuery = useAsync(() => (isAdmin ? getPendingJoinRequestsCount() : Promise.resolve(0)), [isAdmin]);

  useEffect(() => {
    if (listQuery.status !== 'ready') {
      return;
    }
    setKnownAuthors((prev) => {
      const next = new Map(prev);
      listQuery.data.items.forEach((item) => next.set(item.author.id, item.author));
      return next;
    });
  }, [listQuery]);

  // Стоя на вкладке "Админ", можно перестать быть админом прямо на этом экране -
  // например, переключившись в DemoSwitcher на участника без прав. Компонент при
  // этом не размонтируется, а сама вкладка из tabs пропадает - без сброса tab
  // экран продолжил бы показывать админ-меню тому, кому оно уже не положено.
  useEffect(() => {
    if (!isAdmin && tab === 'ADMIN') {
      setTab('WAITING_ME');
    }
  }, [isAdmin, tab]);

  const tabs = useMemo<TabItem<ScreenTab>[]>(
    () => [
      { key: 'WAITING_ME', label: 'Ждут меня', count: waitingCountQuery.status === 'ready' ? waitingCountQuery.data.total : undefined },
      { key: 'MINE', label: 'Мои' },
      { key: 'AVAILABLE', label: 'Доступные мне' },
      ...(isAdmin ? [{ key: 'ADMIN' as const, label: 'Админ' }] : []),
    ],
    [waitingCountQuery, isAdmin],
  );

  const activeFiltersCount = Object.values(filters).filter((value) => value !== undefined).length;

  return (
    // ScreenShell + flex:1 на CenteredColumn - чтобы BottomActionBar не повисал сразу
    // под коротким контентом, а стоял у края экрана; BottomActionBar - не внутри этого
    // CenteredColumn, а рядом с ним (см. components/base/Layout.tsx, BottomActionBar).
    <ScreenShell>
      <CenteredColumn style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        <Typography.Headline variant="large-strong">Документы</Typography.Headline>

        <Tabs tabs={tabs} activeKey={tab} onChange={setTab} />

        {tab === 'ADMIN' ? (
          <AdminSectionsList
            pendingRequests={pendingRequestsQuery.status === 'ready' ? pendingRequestsQuery.data : undefined}
            onNavigate={navigate}
          />
        ) : (
          <>
            {/* Родитель - flex-column без alignItems, поэтому по умолчанию (stretch) кнопка
                растянулась бы на всю ширину колонки, хотя это второстепенное действие,
                а не главная кнопка экрана - alignSelf возвращает ей размер по содержимому. */}
            <Button variant="secondary" size="small" style={{ alignSelf: 'flex-start' }} onClick={() => setFiltersOpen(true)}>
              {activeFiltersCount > 0 ? `Фильтры (${activeFiltersCount})` : 'Фильтры'}
            </Button>

            {listQuery.status === 'loading' && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <Spinner />
              </div>
            )}

            {listQuery.status === 'error' && <ErrorState message={errorMessage(listQuery.error)} onRetry={listQuery.refresh} />}

            {listQuery.status === 'ready' && listQuery.data.items.length === 0 && (
              // docs/SCREENS.md для "Мои" называет и текст, и кнопку "Новый документ" в
              // пустом состоянии - но она внизу экрана есть всегда (BottomActionBar), так
              // что повторять её в самой карточке - чистое дублирование без пользы, только
              // текст без действия.
              <EmptyState text={TAB_EMPTY_TEXT[docTab]} />
            )}

            {listQuery.status === 'ready' && listQuery.data.items.length > 0 && (
              <CellList mode="full-width" style={{ marginBottom: 16 }}>
                {listQuery.data.items.map((item, index) => (
                  <DocumentRow
                    key={item.id}
                    item={item}
                    showWaiting={docTab === 'WAITING_ME'}
                    // .CellSimple_separator рисует border-top, не border-bottom - черта
                    // нужна перед КАЖДЫМ элементом, кроме первого, а не после каждого, кроме последнего.
                    separator={index > 0}
                    onOpen={() => navigate(documentCardPath(item.id))}
                  />
                ))}
              </CellList>
            )}
          </>
        )}
      </CenteredColumn>

      {/* "Новый документ" не показываем на вкладке "Админ" - создание документа не
          относится к администрированию компании, в макете admin-management-screen
          нижней кнопки тоже нет. */}
      {tab !== 'ADMIN' && (
        <BottomActionBar>
          <Button stretched variant="primary" onClick={() => navigate(ROUTE_PATTERNS.documentUpload)}>
            Новый документ
          </Button>
        </BottomActionBar>
      )}

      <BottomSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Фильтры">
        <FiltersForm
          filters={filters}
          types={typesQuery.status === 'ready' ? typesQuery.data : []}
          authors={[...knownAuthors.values()]}
          onApply={(next) => {
            setFilters(next);
            setFiltersOpen(false);
          }}
        />
      </BottomSheet>
    </ScreenShell>
  );
}

function DocumentRow({
  item,
  showWaiting,
  separator,
  onOpen,
}: {
  item: DocumentListItem;
  showWaiting: boolean;
  separator: boolean;
  onOpen: () => void;
}) {
  const dateOrWaiting = showWaiting && item.waitingSince ? waitingText(item.waitingSince) : formatDate(item.updatedAt);

  return (
    <CellSimple
      as="button"
      onClick={onOpen}
      separator={separator}
      title={item.title}
      subtitle={`${item.type.name} · ${item.author.fullName} · ${dateOrWaiting}`}
      after={<DocumentStatusBadge status={item.status} />}
    />
  );
}

/** Вкладка "Админ" - вход в экраны 3/6/7 (макет admin-management-screen). */
function AdminSectionsList({
  pendingRequests,
  onNavigate,
}: {
  pendingRequests: number | undefined;
  onNavigate: NavigateFunction;
}) {
  return (
    <CellList mode="full-width">
      <CellSimple
        as="button"
        onClick={() => onNavigate(ROUTE_PATTERNS.adminInvite)}
        title="Приглашение"
        subtitle="Код подключения и ссылки"
      />
      <CellSimple
        as="button"
        separator
        onClick={() => onNavigate(ROUTE_PATTERNS.adminRequests)}
        title="Заявки"
        subtitle="Заявки на вступление в компанию"
        after={pendingRequests ? <CountBadge count={pendingRequests} /> : undefined}
      />
      <CellSimple
        as="button"
        separator
        onClick={() => onNavigate(ROUTE_PATTERNS.adminMembers)}
        title="Участники"
        subtitle="Список сотрудников и управление доступом"
      />
    </CellList>
  );
}

function FiltersForm({
  filters,
  types,
  authors,
  onApply,
}: {
  filters: DocumentListFilters;
  types: DocumentType[];
  authors: UserRef[];
  onApply: (filters: DocumentListFilters) => void;
}) {
  const [status, setStatus] = useState<DocumentStatus | ''>(filters.status ?? '');
  const [typeId, setTypeId] = useState<number | ''>(filters.typeId ?? '');
  const [authorId, setAuthorId] = useState<number | ''>(filters.authorId ?? '');
  const [from, setFrom] = useState(filters.from ?? '');
  const [to, setTo] = useState(filters.to ?? '');

  const selectStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--divider-primary)',
    background: 'var(--background-primary)',
    color: 'var(--text-primary)',
    fontSize: 14,
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Typography.Text>Статус</Typography.Text>
        <select style={selectStyle} value={status} onChange={(event) => setStatus(event.target.value as DocumentStatus | '')}>
          <option value="">Все</option>
          {STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {documentStatusMeta(value).text}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Typography.Text>Тип документа</Typography.Text>
        <select style={selectStyle} value={typeId} onChange={(event) => setTypeId(event.target.value ? Number(event.target.value) : '')}>
          <option value="">Все</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Typography.Text>Автор</Typography.Text>
        <select style={selectStyle} value={authorId} onChange={(event) => setAuthorId(event.target.value ? Number(event.target.value) : '')}>
          <option value="">Все</option>
          {authors.map((author) => (
            <option key={author.id} value={author.id}>
              {author.fullName}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <Typography.Text>С</Typography.Text>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <Typography.Text>По</Typography.Text>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>

      <Button
        stretched
        variant="primary"
        onClick={() =>
          onApply({
            status: status || undefined,
            typeId: typeId || undefined,
            authorId: authorId || undefined,
            from: from || undefined,
            to: to || undefined,
          })
        }
      >
        Применить
      </Button>
    </div>
  );
}
