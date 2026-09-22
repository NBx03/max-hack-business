import { useEffect, useMemo, useState } from 'react';
import { Button, Spinner, Typography } from '@maxhub/max-ui';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { getDocuments, getDocumentTypes, type DocumentTab, type DocumentListFilters } from '../../api/documents';
import { errorMessage } from '../../api/errors';
import type { DocumentListItem, DocumentStatus, DocumentType, UserRef } from '../../api/types';
import { BottomSheet } from '../../components/base/BottomSheet';
import { BottomActionBar, CenteredColumn } from '../../components/base/Layout';
import { DocumentStatusBadge } from '../../components/base/StatusBadge';
import { Tabs, type TabItem } from '../../components/base/Tabs';
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

/** 8. Список документов - главный экран (docs/SCREENS.md). */
export function DocumentListScreen() {
  const navigate = useNavigate();
  const { me } = useSession();
  const isAdmin = Boolean(me?.actingAs ? me.actingAs.isAdmin : me?.membership?.isAdmin);
  const [tab, setTab] = useState<DocumentTab>('WAITING_ME');
  const [filters, setFilters] = useState<DocumentListFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Известные авторы - накапливаются из уже загруженных документов, отдельного
  // эндпоинта "все авторы" для не-админа нет (GET /orgs/current/members - только ADMIN).
  const [knownAuthors, setKnownAuthors] = useState<Map<number, UserRef>>(new Map());

  const listQuery = useAsync(() => getDocuments(tab, { ...filters, size: 50 }), [tab, filters]);
  // "Ждут меня" со счётчиком - total отдельного запроса с size=1, независимо от фильтров текущей вкладки.
  const waitingCountQuery = useAsync(() => getDocuments('WAITING_ME', { size: 1 }), []);
  const typesQuery = useAsync(() => getDocumentTypes(), []);

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

  const tabs = useMemo<TabItem<DocumentTab>[]>(
    () => [
      { key: 'WAITING_ME', label: 'Ждут меня', count: waitingCountQuery.status === 'ready' ? waitingCountQuery.data.total : undefined },
      { key: 'MINE', label: 'Мои' },
      { key: 'AVAILABLE', label: 'Доступные мне' },
    ],
    [waitingCountQuery],
  );

  const activeFiltersCount = Object.values(filters).filter((value) => value !== undefined).length;

  return (
    <CenteredColumn style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Typography.Title variant="large-strong">Документы</Typography.Title>

      <Tabs tabs={tabs} activeKey={tab} onChange={setTab} />

      {isAdmin && (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="small" onClick={() => navigate(ROUTE_PATTERNS.adminInvite)}>
            Приглашение
          </Button>
          <Button variant="ghost" size="small" onClick={() => navigate(ROUTE_PATTERNS.adminRequests)}>
            Заявки
          </Button>
          <Button variant="ghost" size="small" onClick={() => navigate(ROUTE_PATTERNS.adminMembers)}>
            Участники
          </Button>
        </div>
      )}

      <Button variant="secondary" size="small" onClick={() => setFiltersOpen(true)}>
        {activeFiltersCount > 0 ? `Фильтры (${activeFiltersCount})` : 'Фильтры'}
      </Button>

      {listQuery.status === 'loading' && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Spinner />
        </div>
      )}

      {listQuery.status === 'error' && <ErrorState message={errorMessage(listQuery.error)} onRetry={listQuery.refresh} />}

      {listQuery.status === 'ready' && listQuery.data.items.length === 0 && (
        <EmptyState
          text={TAB_EMPTY_TEXT[tab]}
          actionLabel={tab !== 'WAITING_ME' ? 'Новый документ' : undefined}
          onAction={tab !== 'WAITING_ME' ? () => navigate(ROUTE_PATTERNS.documentUpload) : undefined}
        />
      )}

      {listQuery.status === 'ready' && listQuery.data.items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 16 }}>
          {listQuery.data.items.map((item) => (
            <DocumentRow key={item.id} item={item} showWaiting={tab === 'WAITING_ME'} onOpen={() => navigate(documentCardPath(item.id))} />
          ))}
        </div>
      )}

      <BottomActionBar>
        <Button stretched variant="primary" onClick={() => navigate(ROUTE_PATTERNS.documentUpload)}>
          Новый документ
        </Button>
      </BottomActionBar>

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
    </CenteredColumn>
  );
}

function DocumentRow({
  item,
  showWaiting,
  onOpen,
}: {
  item: DocumentListItem;
  showWaiting: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 12,
        borderRadius: 8,
        border: '1px solid var(--divider-primary)',
        background: 'var(--background-secondary)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</span>
        <DocumentStatusBadge status={item.status} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-tertiary)' }}>
        <span>{item.type.name}</span>
        <span>
          {item.author.fullName} · {showWaiting && item.waitingSince ? `ждёт ${daysWaiting(item.waitingSince)} дн.` : formatDate(item.updatedAt)}
        </span>
      </div>
    </button>
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
          <input style={selectStyle} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <Typography.Text>По</Typography.Text>
          <input style={selectStyle} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
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
