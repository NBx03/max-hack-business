import { Switch } from '@maxhub/max-ui';
import { useState } from 'react';
import { errorMessage } from '../../api/errors';
import { setRouteRoleMandatory } from '../../api/organization';
import type { DocumentType, RouteOverview } from '../../api/types';
import { BottomSheet, Icon, InlineError, List, Muted, Row, Section } from '../../ui';
import { isOutsideTemplates } from '../documents/documentKind';

/** Как на экране загрузки: по алфавиту, «Другой документ» последним. */
function byName(types: DocumentType[]): DocumentType[] {
  return [...types].sort((left, right) =>
    Number(left.code === 'GENERIC') - Number(right.code === 'GENERIC') || left.name.localeCompare(right.name, 'ru'));
}

/**
 * Кто и в каком порядке согласует каждый вид документа — стартовый маршрут (D3). Автор перед отправкой меняет
 * его как угодно, но обязательных не убирает: они отмечены замком. Администратор отмечает обязательные роли (#109);
 * у «Другого документа» обязательных нет — маршрут составляет автор.
 */
export function RoutesCard({ routes: initialRoutes, types, isAdmin }: { routes: RouteOverview[]; types: DocumentType[]; isAdmin: boolean }) {
  const [routes, setRoutes] = useState(initialRoutes);
  const [editing, setEditing] = useState<DocumentType | null>(null);
  const byType = new Map(routes.map((route) => [route.documentTypeId, route]));
  const rows = byName(types).filter((type) => byType.has(type.id));
  if (rows.length === 0) return null;
  return (
    // Никита не понял, что это и зачем (замечание 26.09): заголовок — вопрос, на который блок отвечает, пояснение —
    // что с этим делать, этапы — по строкам с номерами, а не стрелками в одну строку.
    <Section
      title="Кто согласует документы"
      hint={
        isAdmin
          ? 'Так маршрут заполняется сам, когда сотрудник отправляет документ. Перед отправкой автор может поменять людей и порядок, но не уберёт обязательных. Нажмите на вид, чтобы выбрать, кто обязателен.'
          : 'Так маршрут заполняется сам, когда вы отправляете документ. Перед отправкой людей и порядок можно поменять, кроме обязательных.'
      }
    >
      <p className="ds-section__hint" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Icon name="lock" size={14} /> — обязательный, убрать из маршрута нельзя
      </p>
      <List label="Маршруты согласования">
        {rows.map((type) => (
          <Row
            key={type.id}
            title={type.name}
            subtitle={<RouteLine route={byType.get(type.id)!} />}
            onClick={isAdmin && !isOutsideTemplates(type.code) ? () => setEditing(type) : undefined}
          />
        ))}
      </List>
      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Обязательные — ${editing.name}` : ''}>
        {editing && byType.get(editing.id) && (
          <MandatoryEditor type={editing} route={byType.get(editing.id)!} onSaved={setRoutes} />
        )}
      </BottomSheet>
    </Section>
  );
}

function RouteLine({ route }: { route: RouteOverview }) {
  if (route.stages.length === 0) {
    return <span>Маршрут составляет автор</span>;
  }
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {route.stages.map((stage, index) => (
        <span key={stage.stageOrder} style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 4 }}>
          <span>{index + 1}.</span>
          {stage.participants.map((participant, i) => (
            <span key={participant.role.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              {i > 0 && 'и '}
              {participant.role.name}
              {participant.mandatory && <Icon name="lock" size={13} label="обязательный" />}
            </span>
          ))}
          {stage.participants.length > 1 && <span>— одновременно</span>}
        </span>
      ))}
    </span>
  );
}

/** Переключатель на каждую роль маршрута: сохраняется сразу, без отдельной кнопки. */
function MandatoryEditor({ type, route, onSaved }: { type: DocumentType; route: RouteOverview; onSaved: (routes: RouteOverview[]) => void }) {
  const [busyRoleId, setBusyRoleId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const participants = route.stages.flatMap((stage) => stage.participants);

  async function toggle(roleId: number, mandatory: boolean) {
    setBusyRoleId(roleId);
    setError(null);
    try {
      onSaved(await setRouteRoleMandatory(type.id, roleId, mandatory));
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusyRoleId(null);
    }
  }

  return (
    <>
      <Muted>
        Обязательную роль автор не уберёт из маршрута. Если такой роли нет ни у кого, кроме автора, шаг засчитается
        автоматически; если нет ни у кого — отправить документ не получится.
      </Muted>
      <List label="Роли маршрута">
        {participants.map((participant) => (
          <label key={participant.role.id} className="ds-row" style={{ cursor: 'pointer' }}>
            <span className="ds-row__body">
              <span className="ds-row__title">{participant.role.name}</span>
              <span className="ds-row__subtitle">{participant.mandatory ? 'Обязательна — с замком' : 'Можно убрать'}</span>
            </span>
            <Switch
              checked={participant.mandatory}
              disabled={busyRoleId !== null}
              onChange={(event) => void toggle(participant.role.id, event.target.checked)}
            />
          </label>
        ))}
      </List>
      {error && <InlineError>{error}</InlineError>}
      <Muted>Изменение действует на новые маршруты; документы, уже отправленные на согласование, не меняются.</Muted>
    </>
  );
}
