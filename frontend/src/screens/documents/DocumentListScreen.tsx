import { useEffect, useMemo, useState } from 'react';
import { Input } from '@maxhub/max-ui';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { getDocuments, getDocumentTypes, type DocumentListFilters } from '../../api/documents';
import { errorMessage } from '../../api/errors';
import type { DocumentListItem, DocumentStatus, DocumentType, UserRef } from '../../api/types';
import { useSession } from '../../app/SessionContext';
import { useAsync } from '../../hooks/useAsync';
import {
  DOCUMENT_LISTS,
  ROUTE_PATTERNS,
  documentCardPath,
  documentListPath,
  isDocumentListKey,
  type DocumentListKey,
} from '../../routes/paths';
import {
  BottomSheet,
  Button,
  Chip,
  Chips,
  DocumentStatusBadge,
  EmptyState,
  ErrorState,
  List,
  Loading,
  Page,
  PageHeader,
  Row,
  SelectField,
  documentStatusMeta,
  type SelectOption,
} from '../../ui';

/** Какие статусы вообще бывают в разделе: у чужих документов нет черновиков, у «на согласовании» — только он. */
const LIST_STATUSES: Record<DocumentListKey, DocumentStatus[]> = {
  waiting: [],
  mine: ['DRAFT', 'IN_APPROVAL', 'RETURNED', 'APPROVED', 'REJECTED'],
  shared: ['IN_APPROVAL', 'RETURNED', 'APPROVED', 'REJECTED'],
};

/** Пустой раздел объясняет, что здесь появится и что сделать (принцип 7). */
const EMPTY: Record<DocumentListKey, { title: string; text: string }> = {
  waiting: {
    title: 'Ничего не ждёт вашего решения',
    text: 'Когда подойдёт ваша очередь согласовать документ, он появится здесь, а бот пришлёт сообщение.',
  },
  mine: {
    title: 'Вы ещё не создавали документы',
    text: 'Загрузите файл или заполните служебную записку — сервис проверит документ и поможет отправить его на согласование.',
  },
  shared: {
    title: 'Пока нет общих документов',
    text: 'Здесь появятся документы коллег, открытые для всей компании, и те, в согласовании которых вы участвовали.',
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** «день»/«дня»/«дней» — обычные русские правила (11–14 всегда «дней»). */
function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
  return 'дней';
}

function waitingText(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
  return days === 0 ? 'ждёт с сегодня' : `ждёт ${days} ${pluralDays(days)}`;
}

/** Фильтры, кроме статуса, — в панели «Ещё фильтры»; помним на время работы, отдельно для каждого раздела. */
const remembered = new Map<string, DocumentListFilters>();

/** Раздел документов (NAV-1, NAV-2): «На моём согласовании», «Мои документы», «Общие документы». */
export function DocumentListRoute() {
  const { list } = useParams<{ list: string }>();
  if (!isDocumentListKey(list)) {
    return <Navigate to={ROUTE_PATTERNS.home} replace />;
  }
  return <DocumentListScreen key={list} list={list} />;
}

function DocumentListScreen({ list }: { list: DocumentListKey }) {
  const navigate = useNavigate();
  const { me } = useSession();
  const meta = DOCUMENT_LISTS[list];
  const actor = me?.actingAs ? `demo-${me.actingAs.user.id}` : `user-${me?.user.id ?? 0}`;
  const memoryKey = `${actor}:${list}`;
  const [filters, setFiltersState] = useState<DocumentListFilters>(() => remembered.get(memoryKey) ?? {});
  const setFilters = (next: DocumentListFilters) => {
    remembered.set(memoryKey, next);
    setFiltersState(next);
  };
  const [moreOpen, setMoreOpen] = useState(false);
  // Авторы — из уже загруженных документов: отдельного «все авторы» для не-администратора нет.
  const [knownAuthors, setKnownAuthors] = useState<Map<number, UserRef>>(new Map());

  const query = useAsync(() => getDocuments(meta.tab, { ...filters, size: 50 }), [meta.tab, filters]);
  const typesQuery = useAsync(() => getDocumentTypes(), []);

  useEffect(() => {
    if (query.status !== 'ready') return;
    setKnownAuthors((prev) => {
      const next = new Map(prev);
      query.data.items.forEach((item) => next.set(item.author.id, item.author));
      return next;
    });
  }, [query]);

  const statuses = LIST_STATUSES[list];
  const moreCount = [filters.typeId, filters.authorId, filters.from, filters.to].filter((value) => value !== undefined).length;
  const filtered = moreCount > 0 || filters.status !== undefined;

  const openCard = (item: DocumentListItem) =>
    navigate(documentCardPath(item.id), { state: { from: documentListPath(list), fromLabel: meta.title } });

  return (
    <Page
      header={<PageHeader back={{ to: ROUTE_PATTERNS.home, label: 'Главная' }} title={meta.title} subtitle={meta.hint} />}
      footer={
        list === 'mine' ? (
          <Button variant="primary" stretched icon="plus" onClick={() => navigate(ROUTE_PATTERNS.documentUpload)}>
            Новый документ
          </Button>
        ) : undefined
      }
    >
      <Chips label="Фильтры">
        <Chip selected={moreCount > 0} onClick={() => setMoreOpen(true)}>
          {moreCount > 0 ? `Фильтры · ${moreCount}` : 'Фильтры'}
        </Chip>
        {statuses.length > 0 && (
          <Chip selected={filters.status === undefined} onClick={() => setFilters({ ...filters, status: undefined })}>
            Все
          </Chip>
        )}
        {statuses.map((status) => (
          <Chip
            key={status}
            selected={filters.status === status}
            onClick={() => setFilters({ ...filters, status: filters.status === status ? undefined : status })}
          >
            {documentStatusMeta(status).text}
          </Chip>
        ))}
      </Chips>

      {query.status === 'loading' && <Loading />}
      {query.status === 'error' && <ErrorState message={errorMessage(query.error)} onRetry={query.refresh} />}
      {query.status === 'ready' && query.data.items.length === 0 && (
        filtered ? (
          <EmptyState
            icon="search"
            title="Ничего не нашлось"
            text="По выбранным фильтрам документов нет."
            actionLabel="Сбросить фильтры"
            onAction={() => setFilters({})}
          />
        ) : (
          <EmptyState title={EMPTY[list].title} text={EMPTY[list].text} />
        )
      )}
      {query.status === 'ready' && query.data.items.length > 0 && (
        <List label={meta.title}>
          {query.data.items.map((item) => (
            <Row
              key={item.id}
              title={item.title}
              // Метка — под названием, а не справа: на 360 px справа она отнимала ширину, и название
              // переносилось на три строки. На согласовании у всех один статус — там вместо метки срок ожидания.
              subtitle={
                <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', marginTop: 2 }}>
                  {list !== 'waiting' && <DocumentStatusBadge status={item.status} />}
                  <span>
                    {[
                      item.type.name,
                      item.author.fullName,
                      list === 'waiting' && item.waitingSince ? waitingText(item.waitingSince) : formatDate(item.updatedAt),
                    ].join(' · ')}
                  </span>
                </span>
              }
              onClick={() => openCard(item)}
            />
          ))}
        </List>
      )}

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Фильтры">
        <MoreFilters
          filters={filters}
          types={typesQuery.status === 'ready' ? typesQuery.data : []}
          authors={[...knownAuthors.values()]}
          showAuthor={list !== 'mine'}
          onApply={(next) => {
            setFilters(next);
            setMoreOpen(false);
          }}
        />
      </BottomSheet>
    </Page>
  );
}

function MoreFilters({
  filters,
  types,
  authors,
  showAuthor,
  onApply,
}: {
  filters: DocumentListFilters;
  types: DocumentType[];
  authors: UserRef[];
  showAuthor: boolean;
  onApply: (filters: DocumentListFilters) => void;
}) {
  const [typeId, setTypeId] = useState<number>(filters.typeId ?? 0);
  const [authorId, setAuthorId] = useState<number>(filters.authorId ?? 0);
  const [from, setFrom] = useState(filters.from ?? '');
  const [to, setTo] = useState(filters.to ?? '');

  const typeOptions = useMemo<SelectOption<number>[]>(
    () => [{ value: 0, label: 'Все виды' }, ...types.map((type) => ({ value: type.id, label: type.name }))],
    [types],
  );
  const authorOptions = useMemo<SelectOption<number>[]>(
    () => [{ value: 0, label: 'Все авторы' }, ...authors.map((author) => ({ value: author.id, label: author.fullName }))],
    [authors],
  );

  return (
    <>
      <SelectField label="Вид документа" placeholder="Все виды" options={typeOptions} value={typeId} onChange={setTypeId} />
      {showAuthor && (
        <SelectField label="Автор" placeholder="Все авторы" options={authorOptions} value={authorId} onChange={setAuthorId} searchable />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <label className="ds-field" style={{ flex: 1 }}>
          <span className="ds-field__label">Создан с</span>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="ds-field" style={{ flex: 1 }}>
          <span className="ds-field__label">по</span>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      <Button
        variant="primary"
        stretched
        onClick={() =>
          onApply({
            status: filters.status,
            typeId: typeId || undefined,
            authorId: authorId || undefined,
            from: from || undefined,
            to: to || undefined,
          })
        }
      >
        Показать
      </Button>
      <Button stretched onClick={() => onApply({ status: filters.status })}>
        Сбросить
      </Button>
    </>
  );
}
