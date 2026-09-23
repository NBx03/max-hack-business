import { Button, CellList, CellSimple, Typography } from '@maxhub/max-ui';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { useSession } from '../../app/SessionContext';
import { useOpenDemo } from '../../app/useOpenDemo';
import { demoEntryUser } from '../../app/demo';
import { getPendingJoinRequestsCount } from '../../api/organization';
import { CountBadge } from '../../components/base/Tabs';
import { ErrorText } from '../../components/base/StateCard';
import { useAsync } from '../../hooks/useAsync';
import { ROUTE_PATTERNS } from '../../routes/paths';
import { DocumentScreen, sectionStyle, stackStyle } from '../documents/DocumentFormParts';

function roleLine(roles: { name: string }[], isAdmin: boolean): string {
  const names = roles.map((role) => role.name);
  if (isAdmin) names.push('администратор');
  return names.length > 0 ? names.join(', ') : 'без ролей — роли назначает администратор';
}

/**
 * Раздел «Компания» нижнего меню: чья это компания и кто я в ней, администрирование (раньше —
 * вкладка «Админ» на списке документов), вход в демо и короткое «как это работает». Отсюда же
 * участник реальной компании попадает в демо: раньше кнопка была только на приветствии,
 * которое после создания компании уже не показывается (#50).
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
        setRestartError('Не удалось открыть демо-компанию, попробуйте ещё раз');
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
          {inDemo && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Демо-компания — ваша личная копия</span>}
        </div>
        {actor && (
          <div style={{ ...stackStyle, gap: 2 }}>
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{inDemo ? 'Вы действуете как' : 'Вы'}</span>
            <strong>{actor.user.fullName}</strong>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{roleLine(actor.roles, actor.isAdmin)}</span>
          </div>
        )}
      </section>

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
              title="Участники"
              subtitle="Роли, права администратора, отключение"
            />
          </CellList>
        </div>
      )}

      {me?.demoMode && (
        <section style={sectionStyle}>
          <Typography.Headline variant="small">Демо-компания</Typography.Headline>
          {inDemo ? (
            <>
              <Typography.Text>
                Сменить участника можно плашкой «Демо» вверху экрана. Ваши действия в демо не видит никто,
                кроме вас.
              </Typography.Text>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" loading={restarting} onClick={() => void restartDemo()}>
                  Начать заново
                </Button>
                <Button variant="secondary" disabled={restarting} onClick={() => void actAs(null)}>
                  Выйти из демо
                </Button>
              </div>
              {restartError && <ErrorText>{restartError}</ErrorText>}
            </>
          ) : (
            <>
              <Typography.Text>
                Личная копия компании с готовыми сотрудниками и документами: пройдите весь сценарий от имени
                автора, юриста, бухгалтера и директора. Ваша компания при этом не меняется.
              </Typography.Text>
              <Button variant="secondary" loading={demo.busy} onClick={() => void demo.open()}>
                {demo.hasSandbox ? 'Вернуться в демо-компанию' : 'Открыть демо-компанию'}
              </Button>
              {demo.error && <ErrorText>{demo.error}</ErrorText>}
            </>
          )}
        </section>
      )}

      <section style={sectionStyle}>
        <Typography.Headline variant="small">Как проходит согласование</Typography.Headline>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--text-secondary)' }}>
          <li>Автор загружает документ. ИИ (GigaChat) читает текст и находит в нём поля: дату, адресата, подпись и другие.</li>
          <li>Правила компании и закона проверяют эти поля. У каждого замечания — ссылка на источник. Решает не ИИ, а правила.</li>
          <li>Автор исправляет замечания и отправляет документ по маршруту: кто согласует и в каком порядке, задано заранее.</li>
          <li>Согласующие получают уведомление в боте и решают: согласовать, вернуть или отклонить.</li>
        </ol>
      </section>
    </DocumentScreen>
  );
}
