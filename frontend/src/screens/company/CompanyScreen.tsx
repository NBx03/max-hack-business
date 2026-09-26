import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { getDocumentTypes } from '../../api/documents';
import { getColleagues, getOrganizationMetrics, getPendingJoinRequestsCount, getRoutes } from '../../api/organization';
import type { MemberView } from '../../api/types';
import { useSession } from '../../app/SessionContext';
import { useOpenDemo } from '../../app/useOpenDemo';
import { demoEntryUser } from '../../app/demo';
import { useAsync } from '../../hooks/useAsync';
import { ROUTE_PATTERNS } from '../../routes/paths';
import { Button, Count, Icon, InlineError, Initials, List, Muted, Page, PageHeader, Row, Section } from '../../ui';
import { MetricsCard } from './MetricsCard';
import { RoutesCard } from './RoutesCard';

/**
 * «Компания» (плитка главной): кто в компании и с какими ролями, администрирование, правила, маршруты и показатели.
 * Демонстрационный режим — внизу и без акцента: он для знакомства с продуктом, а не для работы (приёмка 24.09).
 */
export function CompanyScreen() {
  const navigate = useNavigate();
  const { me, actAs, startSandbox } = useSession();
  const demo = useOpenDemo();
  const inDemo = Boolean(me?.actingAs);
  const actor = me?.actingAs ?? (me?.membership ? { user: me.user, roles: me.membership.roles, isAdmin: me.membership.isAdmin } : null);
  const orgName = inDemo ? me?.sandbox?.orgName : me?.membership?.orgName;
  const isAdmin = Boolean(actor?.isAdmin);
  const pendingQuery = useAsync(() => (isAdmin ? getPendingJoinRequestsCount() : Promise.resolve(0)), [isAdmin]);
  const pending = pendingQuery.status === 'ready' ? pendingQuery.data : 0;
  const colleaguesQuery = useAsync(() => getColleagues(), []);
  const metricsQuery = useAsync(() => getOrganizationMetrics(), []);
  const routesQuery = useAsync(() => Promise.all([getRoutes(), getDocumentTypes()]), []);

  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  async function restartDemo() {
    if (restarting) return;
    setRestarting(true);
    setRestartError(null);
    try {
      const users = await startSandbox();
      const entry = demoEntryUser(users);
      if (entry === null) {
        setRestartError('Не удалось открыть демонстрацию, попробуйте ещё раз');
        return;
      }
      await actAs(entry);
    } catch (err) {
      // Песочницу создать не удалось — startSandbox уже вернул прежнего участника.
      setRestartError(errorMessage(err));
    } finally {
      setRestarting(false);
    }
  }

  return (
    <Page
      header={
        <PageHeader
          back={{ to: ROUTE_PATTERNS.home, label: 'Главная' }}
          title={orgName ?? 'Компания'}
          subtitle={inDemo ? 'Демонстрационная компания с вымышленными сотрудниками' : undefined}
        />
      }
    >
      {/* Сначала люди — вы в том же списке, первым: раньше «Вы» стояли отдельно, а «Сотрудники · 4» показывали троих (#56). */}
      <ColleaguesSection
        status={colleaguesQuery.status}
        colleagues={colleaguesQuery.status === 'ready' ? colleaguesQuery.data : []}
        me={actor}
      />

      {isAdmin && (
        <Section title="Администрирование">
          <List label="Администрирование">
            <Row title="Пригласить сотрудников" subtitle="Код компании и личные ссылки" onClick={() => navigate(ROUTE_PATTERNS.adminInvite)} />
            <Row
              title="Заявки на вступление"
              subtitle="Принять и назначить роли"
              after={pending > 0 ? <Count value={pending} accent /> : undefined}
              onClick={() => navigate(ROUTE_PATTERNS.adminRequests)}
            />
            <Row title="Участники и роли" subtitle="Роли, права администратора, исключение" onClick={() => navigate(ROUTE_PATTERNS.adminMembers)} />
          </List>
        </Section>
      )}

      {/* Правила и маршруты — рядом: оба отвечают на вопрос «как у нас проверяют и согласуют документы» (#56). */}
      <Section title="Проверка и согласование">
        <RoutesCard
          // Маршруты хранятся в состоянии карточки (их меняет администратор) — пересоздаём, когда загрузились.
          key={routesQuery.status}
          routes={routesQuery.status === 'ready' ? routesQuery.data[0] : []}
          types={routesQuery.status === 'ready' ? routesQuery.data[1] : []}
          isAdmin={isAdmin}
          before={
            // Правила — всем: автор хочет понять, откуда замечание; администратор — подстроить под компанию (#91).
            <Row
              title="Правила проверки"
              subtitle={isAdmin ? 'Что проверяется — и настройка под компанию' : 'Что проверяется в документах и почему'}
              onClick={() => navigate(ROUTE_PATTERNS.companyRules)}
            />
          }
        />
      </Section>

      {metricsQuery.status === 'ready' && <MetricsCard metrics={metricsQuery.data} />}

      <Section title="Как проходит согласование">
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 'var(--ds-text-s)', lineHeight: '20px', color: 'var(--text-secondary)' }}>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Проверка.</strong> Сервис находит реквизиты и ошибки оформления до отправки.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Маршрут.</strong> Автор видит всю цепочку согласующих с именами и может её поправить.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Решения.</strong> Когда подходит очередь, согласующий получает сообщение в MAX.
          </li>
          <li>
            <strong style={{ color: 'var(--text-primary)' }}>Результат.</strong> Итоговый статус и история решений по каждой версии.
          </li>
        </ol>
      </Section>

      {me?.demoMode && (
        <Section title="Демонстрационный режим">
          {inDemo ? (
            <>
              <Muted>Сотрудника меняйте полосой вверху. Настоящие компании это не затрагивает.</Muted>
              <Button stretched disabled={restarting} onClick={() => void actAs(null)}>
                Выйти из демонстрации
              </Button>
              <Button stretched variant="ghost" loading={restarting} onClick={() => void restartDemo()}>
                Начать заново
              </Button>
              {restartError && <InlineError>{restartError}</InlineError>}
            </>
          ) : (
            <>
              <Muted>Компания с вымышленными сотрудниками — пройти согласование за каждого.</Muted>
              <Button stretched loading={demo.busy} onClick={() => void demo.open()}>
                Посмотреть демонстрацию
              </Button>
              {demo.error && <InlineError>{demo.error}</InlineError>}
            </>
          )}
        </Section>
      )}
    </Page>
  );
}

/** Сколько человек видно сразу: дальше — «Показать всех», чтобы раздел не превращался в простыню. */
const COLLEAGUES_PREVIEW = 5;

type Me = { user: { id: number; fullName: string }; roles: { name: string }[]; isAdmin: boolean } | null;

/**
 * Сотрудники: вы — первым, в том же списке, остальные — по порядку (#56: «Сотрудники · 4» над тремя строками читалось
 * как ошибка). У каждого — инициалы, имя и роли одной строкой.
 */
function ColleaguesSection({
  status,
  colleagues,
  me,
}: {
  status: 'loading' | 'ready' | 'error';
  colleagues: MemberView[];
  me: Me;
}) {
  const [showAll, setShowAll] = useState(false);
  if (status === 'error') return null;
  // Себя берём из /me: в демо «вы» — участник песочницы, от имени которого идёт работа.
  const others = colleagues.filter((colleague) => colleague.user.id !== me?.user.id);
  const people = [
    ...(me ? [{ key: 'me', name: me.user.fullName, title: `${me.user.fullName} (вы)`, roles: me.roles, isAdmin: me.isAdmin }] : []),
    ...others.map((colleague) => ({
      key: String(colleague.memberId),
      name: colleague.user.fullName,
      title: colleague.user.fullName,
      roles: colleague.roles,
      isAdmin: colleague.isAdmin,
    })),
  ];
  const visible = showAll ? people : people.slice(0, COLLEAGUES_PREVIEW);
  return (
    <Section title={`Сотрудники${status === 'ready' ? ` · ${people.length}` : ''}`}>
      {status === 'loading' ? (
        <Muted>Загружаем список сотрудников…</Muted>
      ) : (
        <>
          <List label="Сотрудники">
            {visible.map((person) => (
              <Row
                key={person.key}
                before={<Initials name={person.name} />}
                title={person.title}
                subtitle={shortRoleLine(person.roles, person.isAdmin)}
              />
            ))}
          </List>
          {others.length === 0 && <Muted>Пока в компании только вы.</Muted>}
          {people.length > COLLEAGUES_PREVIEW && (
            <button type="button" className="ds-link-toggle" aria-expanded={showAll} onClick={() => setShowAll((open) => !open)}>
              {showAll ? 'Свернуть' : `Показать всех (${people.length})`}
              <span style={{ display: 'inline-flex', transform: showAll ? 'rotate(180deg)' : undefined }}>
                <Icon name="chevronDown" size={16} />
              </span>
            </button>
          )}
        </>
      )}
    </Section>
  );
}

/** Роли через точку; без ролей — коротко, без объяснений на каждой строке. */
function shortRoleLine(roles: { name: string }[], isAdmin: boolean): string {
  const names = roles.map((role) => role.name);
  if (isAdmin) names.push('администратор');
  return names.length > 0 ? names.join(' · ') : 'Роли не назначены';
}
