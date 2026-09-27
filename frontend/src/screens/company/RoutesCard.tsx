import { useState, type ReactNode } from 'react';
import { errorMessage } from '../../api/errors';
import { getRoles } from '../../api/admin';
import { getColleagues, replaceRouteTemplate } from '../../api/organization';
import { useAsync } from '../../hooks/useAsync';
import type { DocumentType, RoleRef, RouteOverview } from '../../api/types';
import { BottomSheet, Button, ConfirmSheet, Icon, IconButton, InlineError, List, Muted, Row, SelectSheet } from '../../ui';
import type { SelectOption } from '../../ui';
import { isOutsideTemplates } from '../documents/documentKind';
import {
  addRole,
  initialState,
  isDirty,
  moveRole,
  moveStage,
  removeRole,
  setMandatory,
  toRequest,
  usedRoleIds,
  type Target,
  type TemplateSlot,
  type TemplateState,
} from './routeTemplateBuilder';

/** Как на экране загрузки: по алфавиту, «Другой документ» последним. */
function byName(types: DocumentType[]): DocumentType[] {
  return [...types].sort((left, right) =>
    Number(left.code === 'GENERIC') - Number(right.code === 'GENERIC') || left.name.localeCompare(right.name, 'ru'));
}

/**
 * Кто и в каком порядке согласует каждый вид документа — стартовый маршрут (D3). Автор перед отправкой меняет
 * его как угодно, но обязательных не убирает: они отмечены замком. Администратор меняет сам шаблон — состав
 * этапов и ролей, их порядок (#98) и то, какие роли обязательны (#109); у «Другого документа» шаблона нет —
 * маршрут составляет автор.
 *
 * Свёрнуто в одну строку (#56: «блок длинный и виден всегда»): маршруты нужны, когда человек хочет понять, кто
 * согласует его документ, а не при каждом открытии раздела. before — строки, которые стоят в том же списке выше
 * («Правила проверки»): оба пункта отвечают на вопрос «как у нас проверяют и согласуют документы».
 */
export function RoutesCard({
  routes: initialRoutes,
  types,
  isAdmin,
  before,
}: {
  routes: RouteOverview[];
  types: DocumentType[];
  isAdmin: boolean;
  before?: ReactNode;
}) {
  const [routes, setRoutes] = useState(initialRoutes);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentType | null>(null);
  const byType = new Map(routes.map((route) => [route.documentTypeId, route]));
  const rows = byName(types).filter((type) => byType.has(type.id));
  return (
    <>
      <List label="Проверка и согласование">
        {before}
        {rows.length > 0 && (
          <Row
            title="Кто согласует документы"
            subtitle={open ? 'Маршрут по умолчанию для каждого вида' : `Маршруты для видов документов: ${rows.length}`}
            chevron={false}
            after={
              <span style={{ display: 'inline-flex', color: 'var(--text-secondary)', transform: open ? 'rotate(180deg)' : undefined }}>
                <Icon name="chevronDown" size={20} />
              </span>
            }
            onClick={() => setOpen((value) => !value)}
          />
        )}
      </List>
      {open && rows.length > 0 && (
        <>
          <p className="ds-section__hint" style={{ margin: 0 }}>
            {isAdmin
              ? 'Так маршрут заполняется сам при отправке. Автор может поменять людей и порядок, но не уберёт обязательных. Нажмите на вид, чтобы изменить маршрут.'
              : 'Так маршрут заполняется сам при отправке. Людей и порядок можно поменять, кроме обязательных.'}
          </p>
          <p className="ds-section__hint" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="lock" size={14} /> — обязательный, автор не убирает его из маршрута
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
        </>
      )}
      <BottomSheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Маршрут — ${editing.name}` : ''}>
        {editing && byType.get(editing.id) && (
          <RouteTemplateEditor
            type={editing}
            route={byType.get(editing.id)!}
            onSaved={(next) => {
              setRoutes(next);
              setEditing(null);
            }}
          />
        )}
      </BottomSheet>
    </>
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

/**
 * Редактор состава шаблона (#98): этапы, роли на этапах, их порядок, и здесь же — обязательность (#109), чтобы не
 * держать два разных места для одного и того же маршрута. В отличие от конструктора маршрута документа
 * (routeBuilder.ts), администратор убирает и переставляет любую роль, включая обязательные: запрет «обязательную
 * не убрать» действует только на автора при отправке, а не на того, кто меняет сам шаблон компании.
 */
function RouteTemplateEditor({
  type,
  route,
  onSaved,
}: {
  type: DocumentType;
  route: RouteOverview;
  onSaved: (routes: RouteOverview[]) => void;
}) {
  const [state, setState] = useState<TemplateState>(() => initialState(route));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuSlotId, setMenuSlotId] = useState<string | null>(null);
  const [stageMenu, setStageMenu] = useState<number | null>(null);
  const [adding, setAdding] = useState<Target | null>(null);
  const [confirmRole, setConfirmRole] = useState<{ slotId: string; name: string } | null>(null);

  const roles = useAsync(() => getRoles(), []);
  const colleagues = useAsync(() => getColleagues(), []);
  const hasCarrier = (roleId: number) =>
    colleagues.status !== 'ready' || colleagues.data.some((member) => member.roles.some((role) => role.id === roleId));

  const usedIds = usedRoleIds(state);
  const availableRoles = roles.status === 'ready' ? roles.data.filter((role) => !usedIds.has(role.id)) : [];
  const menuSlot = menuSlotId
    ? state.stages.flatMap((stage) => stage.slots).find((slot) => slot.id === menuSlotId) ?? null
    : null;

  function toggleMandatory(slot: TemplateSlot) {
    if (!slot.mandatory && !hasCarrier(slot.roleId)) {
      setConfirmRole({ slotId: slot.id, name: slot.roleName });
      return;
    }
    setState((current) => setMandatory(current, slot.id, !slot.mandatory));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await replaceRouteTemplate(type.id, toRequest(state)));
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Muted>
        Администратор может убрать, добавить и переставить любую роль, включая обязательные — в своём маршруте
        автор их не убирает, а здесь меняется сам шаблон компании. Изменение действует на новые отправки; документы,
        уже отправленные на согласование, не меняются.
      </Muted>
      {state.stages.length === 0 && <Muted>В шаблоне не осталось ни одной роли — маршрут будет составлять автор.</Muted>}
      {state.stages.map((stage, index) => (
        <section key={stage.id} className="ds-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32 }}>
            <h2 className="ds-section__title" style={{ flex: 1 }}>
              Этап {index + 1}
              {stage.slots.length > 1 && <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> · одновременно</span>}
            </h2>
            {state.stages.length > 1 && (
              <IconButton icon="more" label={`Порядок этапа ${index + 1}`} onClick={() => setStageMenu(index)} />
            )}
          </div>
          <List label={`Этап ${index + 1}`}>
            {stage.slots.map((slot) => (
              <RoleRow
                key={slot.id}
                slot={slot}
                hasCarrier={hasCarrier(slot.roleId)}
                onOpen={() => setMenuSlotId(slot.id)}
                onRemove={() => setState((current) => removeRole(current, slot.id))}
              />
            ))}
          </List>
          <Button compact icon="plus" disabled={availableRoles.length === 0} onClick={() => setAdding({ kind: 'stage', index })}>
            Роль
          </Button>
        </section>
      ))}
      <button
        type="button"
        className="ds-dropzone"
        disabled={availableRoles.length === 0}
        onClick={() => setAdding({ kind: 'newStage', index: state.stages.length })}
      >
        <Icon name="plus" size={20} />
        Новый этап
      </button>
      {roles.status === 'ready' && availableRoles.length === 0 && state.stages.length > 0 && (
        <Muted>Все роли компании уже в маршруте.</Muted>
      )}

      {error && <InlineError>{error}</InlineError>}
      <Button variant="primary" stretched loading={saving} disabled={!isDirty(state, route)} onClick={() => void save()}>
        Сохранить
      </Button>

      <AddRoleSheet
        target={adding}
        roles={availableRoles}
        onClose={() => setAdding(null)}
        onPick={(role) => {
          if (adding) setState((current) => addRole(current, role, adding));
          setAdding(null);
        }}
      />

      <RoleMenu
        slot={menuSlot}
        state={state}
        onClose={() => setMenuSlotId(null)}
        onToggleMandatory={() => {
          if (menuSlot) toggleMandatory(menuSlot);
          setMenuSlotId(null);
        }}
        onMove={(target) => {
          if (menuSlotId) setState((current) => moveRole(current, menuSlotId, target));
          setMenuSlotId(null);
        }}
        onRemove={() => {
          if (menuSlotId) setState((current) => removeRole(current, menuSlotId));
          setMenuSlotId(null);
        }}
      />

      <BottomSheet open={stageMenu !== null} onClose={() => setStageMenu(null)} title={`Этап ${(stageMenu ?? 0) + 1}`}>
        <List label="Порядок этапа">
          {stageMenu !== null && stageMenu > 0 && (
            <Row
              title="Поставить раньше"
              subtitle={`станет этапом ${stageMenu}`}
              onClick={() => {
                setState((current) => moveStage(current, stageMenu, -1));
                setStageMenu(null);
              }}
            />
          )}
          {stageMenu !== null && stageMenu < state.stages.length - 1 && (
            <Row
              title="Поставить позже"
              subtitle={`станет этапом ${stageMenu + 2}`}
              onClick={() => {
                setState((current) => moveStage(current, stageMenu, 1));
                setStageMenu(null);
              }}
            />
          )}
        </List>
      </BottomSheet>

      <ConfirmSheet
        open={confirmRole !== null}
        onClose={() => setConfirmRole(null)}
        title={`Сделать «${confirmRole?.name ?? ''}» обязательной?`}
        description={`Сейчас ни у кого в компании нет роли «${confirmRole?.name ?? ''}». Пока её никому не назначат, документы вида «${type.name}» нельзя будет отправить на согласование.`}
        confirmLabel="Всё равно сделать"
        onConfirm={() => {
          if (confirmRole) setState((current) => setMandatory(current, confirmRole.slotId, true));
          setConfirmRole(null);
        }}
      />
    </>
  );
}

function RoleRow({
  slot,
  hasCarrier,
  onOpen,
  onRemove,
}: {
  slot: TemplateSlot;
  hasCarrier: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="ds-row" role="listitem">
      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 44,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 2,
          padding: 0,
          border: 'none',
          background: 'none',
          color: 'inherit',
          font: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span className="ds-row__title" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {slot.roleName}
          {slot.mandatory && <Icon name="lock" size={14} label="Обязательна" />}
        </span>
        <span className="ds-row__subtitle">
          {slot.mandatory ? 'Обязательна — автор не убирает' : 'Не обязательна'}
          {!hasCarrier && ' · сейчас ни у кого нет этой роли'}
        </span>
      </button>
      <IconButton icon="close" label={`Убрать роль: ${slot.roleName}`} onClick={onRemove} />
    </div>
  );
}

/** Куда добавить роль: новый этап или существующий — список ролей, которых ещё нет в шаблоне. */
function AddRoleSheet({
  target,
  roles,
  onClose,
  onPick,
}: {
  target: Target | null;
  roles: RoleRef[];
  onClose: () => void;
  onPick: (role: RoleRef) => void;
}) {
  const options: SelectOption<number>[] = roles.map((role) => ({ value: role.id, label: role.name }));
  const title = target?.kind === 'stage' ? `Роль в этап ${target.index + 1}` : 'Роль в новый этап';
  return (
    <SelectSheet
      open={target !== null}
      onClose={onClose}
      title={title}
      options={options}
      searchable={options.length > 6}
      emptyText="Все роли компании уже в маршруте"
      onSelect={(roleId) => {
        const role = roles.find((item) => item.id === roleId);
        if (role) onPick(role);
      }}
    />
  );
}

/** Меню роли: обязательность, перенос в любой этап, удаление — как в конструкторе маршрута документа. */
function RoleMenu({
  slot,
  state,
  onClose,
  onToggleMandatory,
  onMove,
  onRemove,
}: {
  slot: TemplateSlot | null;
  state: TemplateState;
  onClose: () => void;
  onToggleMandatory: () => void;
  onMove: (target: Target) => void;
  onRemove: () => void;
}) {
  const where = slot ? state.stages.findIndex((stage) => stage.slots.some((item) => item.id === slot.id)) : -1;
  return (
    <BottomSheet open={slot !== null} onClose={onClose} title={slot?.roleName ?? ''}>
      <List label="Обязательность">
        <Row
          title={slot?.mandatory ? 'Сделать необязательной' : 'Сделать обязательной'}
          subtitle={slot?.mandatory ? 'Автор сможет убрать эту роль из своего маршрута' : 'Автор не сможет убрать эту роль из маршрута'}
          onClick={onToggleMandatory}
        />
      </List>
      <p className="ds-section__hint" style={{ margin: 0 }}>Перенести</p>
      <List label="Перенести">
        {state.stages.map((stage, index) =>
          index === where ? null : (
            <Row
              key={stage.id}
              title={`В этап ${index + 1}`}
              subtitle={`вместе с: ${stage.slots.map((item) => item.roleName).join(', ')}`}
              onClick={() => onMove({ kind: 'stage', index })}
            />
          ))}
        <Row title="Отдельным этапом в начале" onClick={() => onMove({ kind: 'newStage', index: 0 })} />
        <Row title="Отдельным этапом в конце" onClick={() => onMove({ kind: 'newStage', index: state.stages.length })} />
      </List>
      <Button variant="danger" stretched icon="close" onClick={onRemove}>
        Убрать роль из маршрута
      </Button>
    </BottomSheet>
  );
}
