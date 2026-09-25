import { useNavigate } from 'react-router-dom';
import { getDocuments } from '../../api/documents';
import { getPendingJoinRequestsCount } from '../../api/organization';
import { useSession } from '../../app/SessionContext';
import { useAsync } from '../../hooks/useAsync';
import { DOCUMENT_LISTS, ROUTE_PATTERNS, documentListPath } from '../../routes/paths';
import { Button, Page, PageHeader, Tile, Tiles } from '../../ui';

function roleLine(roles: { name: string }[], isAdmin: boolean): string {
  const names = roles.map((role) => role.name);
  if (isAdmin) names.push('администратор');
  return names.join(', ');
}

/**
 * Главная (NAV-1, NAV-2): четыре плитки разделов — что за документы и что там сделать — и одно главное действие
 * «Новый документ». Заменяет вкладки «Ждут меня / Мои / Доступные мне» и нижнее меню, которые новичок не понимал.
 * Всё помещается без прокрутки на 360×640.
 */
export function HomeScreen() {
  const navigate = useNavigate();
  const { me } = useSession();
  const actor = me?.actingAs ?? (me?.membership ? { user: me.user, roles: me.membership.roles, isAdmin: me.membership.isAdmin } : null);
  const orgName = me?.actingAs ? me.sandbox?.orgName : me?.membership?.orgName;
  const isAdmin = Boolean(actor?.isAdmin);

  // Счётчики — второстепенны: сбой запроса не мешает навигации, плитка просто без числа.
  const waiting = useAsync(() => getDocuments(DOCUMENT_LISTS.waiting.tab, { size: 1 }), []);
  const requests = useAsync(() => (isAdmin ? getPendingJoinRequestsCount() : Promise.resolve(0)), [isAdmin]);
  const waitingCount = waiting.status === 'ready' ? waiting.data.total : undefined;
  const requestsCount = requests.status === 'ready' ? requests.data : undefined;

  const who = actor ? [actor.user.fullName, roleLine(actor.roles, actor.isAdmin)].filter(Boolean).join(' · ') : undefined;

  return (
    <Page
      header={<PageHeader title={orgName ?? 'Документы'} subtitle={who} />}
      footer={
        <Button variant="primary" stretched icon="plus" onClick={() => navigate(ROUTE_PATTERNS.documentUpload)}>
          Новый документ
        </Button>
      }
    >
      <Tiles>
        <Tile
          icon="inbox"
          title={DOCUMENT_LISTS.waiting.title}
          hint={DOCUMENT_LISTS.waiting.hint}
          count={waitingCount}
          attention
          onClick={() => navigate(documentListPath('waiting'))}
        />
        <Tile
          icon="myDocs"
          title={DOCUMENT_LISTS.mine.title}
          hint={DOCUMENT_LISTS.mine.hint}
          onClick={() => navigate(documentListPath('mine'))}
        />
        <Tile
          icon="shared"
          title={DOCUMENT_LISTS.shared.title}
          hint={DOCUMENT_LISTS.shared.hint}
          onClick={() => navigate(documentListPath('shared'))}
        />
        <Tile
          icon="company"
          title="Компания"
          hint={isAdmin ? 'Сотрудники, роли, приглашения' : 'Сотрудники, маршруты, правила'}
          count={isAdmin ? requestsCount : undefined}
          attention
          onClick={() => navigate(ROUTE_PATTERNS.company)}
        />
      </Tiles>
    </Page>
  );
}
