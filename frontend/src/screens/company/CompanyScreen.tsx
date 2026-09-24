import { Button, CellList, CellSimple, Typography } from '@maxhub/max-ui';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { getColleagues, getOrganizationMetrics, getPendingJoinRequestsCount } from '../../api/organization';
import type { MemberView } from '../../api/types';
import { useSession } from '../../app/SessionContext';
import { useOpenDemo } from '../../app/useOpenDemo';
import { demoEntryUser } from '../../app/demo';
import { CountBadge } from '../../components/base/Tabs';
import { ErrorText } from '../../components/base/StateCard';
import { useAsync } from '../../hooks/useAsync';
import { ROUTE_PATTERNS } from '../../routes/paths';
import { DocumentScreen, sectionStyle, stackStyle } from '../documents/DocumentFormParts';
import { MetricsCard } from './MetricsCard';

function roleLine(roles: { name: string }[], isAdmin: boolean): string {
  const names = roles.map((role) => role.name);
  if (isAdmin) names.push('администратор');
  return names.length > 0 ? names.join(', ') : 'без ролей — роли назначает администратор';
}

const captionStyle = { fontSize: 13, color: 'var(--text-secondary)' } as const;

/**
 * Раздел «Компания» нижнего меню: кто в компании и с какими ролями (видно всем), администрирование,
 * показатели согласования и то, как устроен процесс. Демонстрационный режим — внизу и без акцента:
 * он нужен для знакомства с продуктом, а не для работы (приёмка 24.09).
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
    <DocumentScreen title="Компания" nav>
      <section style={sectionStyle}>
        <div style={{ ...stackStyle, gap: 4 }}>
          <Typography.Headline variant="medium">{orgName ?? 'Компания'}</Typography.Headline>
          {inDemo && <span style={captionStyle}>Демонстрационная компания с вымышленными сотрудниками</span>}
        </div>
        {actor && (
          <div style={{ ...stackStyle, gap: 2 }}>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{inDemo ? 'Вы действуете как' : 'Вы'}</span>
            <strong>{actor.user.fullName}</strong>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{roleLine(actor.roles, actor.isAdmin)}</span>
          </div>
        )}
      </section>

      <ColleaguesSection
        status={colleaguesQuery.status}
        colleagues={colleaguesQuery.status === 'ready' ? colleaguesQuery.data : []}
        currentUserId={actor?.user.id}
        onManage={isAdmin ? () => navigate(ROUTE_PATTERNS.adminMembers) : undefined}
      />

      {isAdmin && (
        <div style={{ ...stackStyle, gap: 8 }}>
          <Typography.Headline variant="small">Администрирование</Typography.Headline>
          <CellList mode="full-width">
            <CellSimple
              as="button"
              showChevron
              onClick={() => navigate(ROUTE_PATTERNS.adminInvite)}
              title="Пригласить сотрудников"
              subtitle="Код компании и личные ссылки"
            />
            <CellSimple
              as="button"
              showChevron
              separator
              onClick={() => navigate(ROUTE_PATTERNS.adminRequests)}
              title="Заявки на вступление"
              subtitle="Принять и назначить роли"
              after={pending ? <CountBadge count={pending} /> : undefined}
            />
            <CellSimple
              as="button"
              showChevron
              separator
              onClick={() => navigate(ROUTE_PATTERNS.adminMembers)}
              title="Участники и роли"
              subtitle="Роли, права администратора, отключение"
            />
          </CellList>
        </div>
      )}

      {/* Второстепенный блок: при ошибке просто не показываем, раздел не должен выглядеть сломанным. */}
      {metricsQuery.status === 'ready' && <MetricsCard metrics={metricsQuery.data} />}

      <section style={sectionStyle}>
        <Typography.Headline variant="small">Как устроено согласование</Typography.Headline>
        <Typography.Text style={{ color: 'var(--text-secondary)' }}>
          Документ проходит нужных людей в установленном порядке, а ошибки оформления находятся до отправки, а не
          у последнего согласующего.
        </Typography.Text>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--text-primary)' }}>
          <li>
            <strong>Подготовка.</strong> Автор загружает документ. Сервис распознаёт его реквизиты — адресата, дату,
            номер, подпись — и сверяет с требованиями к оформлению. У каждого замечания указано основание.
          </li>
          <li>
            <strong>Исправление.</strong> Критичные замечания нужно устранить до отправки — прямо в приложении
            или загрузив исправленный файл.
          </li>
          <li>
            <strong>Маршрут.</strong> Кто согласует документ и в каком порядке, задано для каждого вида документов
            заранее. Перед отправкой автор видит всю цепочку с именами.
          </li>
          <li>
            <strong>Решения.</strong> Согласующие получают сообщение в MAX, когда подходит их очередь, и
            согласуют, возвращают на доработку или отклоняют документ. Решения принимают только люди.
          </li>
          <li>
            <strong>Результат.</strong> Когда все этапы пройдены, документ получает статус «Согласован», а автор —
            уведомление. История решений хранится вместе с каждой версией документа.
          </li>
        </ol>
      </section>

      {me?.demoMode && (
        <section style={{ ...sectionStyle, gap: 8 }}>
          <Typography.Headline variant="small">Демонстрационный режим</Typography.Headline>
          {inDemo ? (
            <>
              <span style={captionStyle}>
                Вы в демонстрационной компании: сменить сотрудника можно полосой вверху экрана. Действия здесь
                не затрагивают настоящие компании.
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" disabled={restarting} onClick={() => void actAs(null)}>
                  Выйти из демонстрации
                </Button>
                <Button variant="ghost" loading={restarting} onClick={() => void restartDemo()}>
                  Начать заново
                </Button>
              </div>
              {restartError && <ErrorText>{restartError}</ErrorText>}
            </>
          ) : (
            <>
              <span style={captionStyle}>
                Для знакомства с продуктом: готовая компания с сотрудниками и документами, где можно пройти
                согласование от имени каждого участника. Ваша компания при этом не меняется.
              </span>
              <div>
                <Button variant="ghost" loading={demo.busy} onClick={() => void demo.open()}>
                  {demo.hasSandbox ? 'Продолжить демонстрацию' : 'Открыть демонстрацию'}
                </Button>
              </div>
              {demo.error && <ErrorText>{demo.error}</ErrorText>}
            </>
          )}
        </section>
      )}
    </DocumentScreen>
  );
}

function ColleaguesSection({
  status,
  colleagues,
  currentUserId,
  onManage,
}: {
  status: 'loading' | 'ready' | 'error';
  colleagues: MemberView[];
  currentUserId: number | undefined;
  onManage?: () => void;
}) {
  if (status === 'error') return null;
  return (
    <div style={{ ...stackStyle, gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <Typography.Headline variant="small">
          Сотрудники{status === 'ready' ? ` · ${colleagues.length}` : ''}
        </Typography.Headline>
        {onManage && (
          <button
            type="button"
            onClick={onManage}
            style={{ border: 'none', background: 'none', padding: 0, color: 'var(--text-accent, #2d7ff9)', fontSize: 14, cursor: 'pointer' }}
          >
            Управлять
          </button>
        )}
      </div>
      {status === 'loading' ? (
        <span style={captionStyle}>Загружаем список сотрудников…</span>
      ) : (
        <CellList mode="full-width">
          {colleagues.map((colleague, index) => (
            <CellSimple
              key={colleague.memberId}
              separator={index > 0}
              title={colleague.user.id === currentUserId ? `${colleague.user.fullName} (вы)` : colleague.user.fullName}
              subtitle={roleLine(colleague.roles, colleague.isAdmin)}
            />
          ))}
        </CellList>
      )}
    </div>
  );
}
