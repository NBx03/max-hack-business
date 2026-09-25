import type { MemberView, RoleRef, RoutePerson, RoutePreview, UserRef } from '../../api/types';

// Модель конструктора маршрута (RTE-1…RTE-6, D3, D4, D6) — чистые функции, покрыты routeBuilder.test.ts.
// Экран только рисует состояние и вызывает эти функции.
//
// Правила: шаблон вида документа лишь предзаполняет маршрут; автор двигает кого угодно между этапами, меняет порядок
// этапов и утверждающего; убрать нельзя только обязательную роль, если в маршруте она у одного человека (замок).
// Человек — один раз. Пустых этапов не бывает: этап, из которого ушёл последний человек, исчезает сам.

/** Место в маршруте: человек или роль, где автору нужно выбрать человека из нескольких кандидатов. */
export type Slot =
  | { kind: 'person'; id: string; userId: number; name: string; roleId: number; roleName: string; roles: string }
  | { kind: 'choice'; id: string; roleId: number; roleName: string; candidates: UserRef[] };

export interface BuilderStage {
  id: string;
  slots: Slot[];
}

export interface BuilderState {
  stages: BuilderStage[];
  /** Утверждающий — последний шаг (D4); null — без утверждения, итог «Согласован». */
  endorser: Slot | null;
}

export type Target = { kind: 'stage'; index: number } | { kind: 'newStage'; index: number } | { kind: 'endorser' };

export interface BuilderContext {
  /** Роли, которые нельзя убрать из маршрута (обязательные в шаблоне и есть кому их нести). */
  mandatoryRoleIds: ReadonlySet<number>;
  /** Коллеги, которых можно поставить в маршрут: активные, с ролями, кроме автора. */
  colleagues: MemberView[];
  /** Роли шаблона — добавленному человеку роль выбирается из них, если он её несёт. */
  templateRoleIds: ReadonlySet<number>;
}

let nextStageId = 0;
function stageId(): string {
  nextStageId += 1;
  return `stage-${nextStageId}`;
}

export function roleNames(roles: { name: string }[]): string {
  return roles.map((role) => role.name).join(' · ');
}

function personSlot(user: UserRef, role: RoleRef, roles: string): Slot {
  return { kind: 'person', id: `u:${user.id}`, userId: user.id, name: user.fullName, roleId: role.id, roleName: role.name, roles };
}

export function contextOf(preview: RoutePreview, colleagues: MemberView[], authorId: number | undefined): BuilderContext {
  const mandatory = new Set<number>();
  const templateRoles = new Set<number>();
  for (const stage of preview.stages) {
    for (const participant of stage.participants) {
      templateRoles.add(participant.role.id);
      if (participant.mandatory && (participant.resolution === 'AUTO' || participant.resolution === 'SELECT')) {
        mandatory.add(participant.role.id);
      }
    }
  }
  return {
    mandatoryRoleIds: mandatory,
    templateRoleIds: templateRoles,
    colleagues: colleagues.filter((member) => member.user.id !== authorId && member.status !== 'DISABLED' && member.roles.length > 0),
  };
}

/** Какой ролью ставить человека: той, что есть в шаблоне, иначе первой из его ролей. */
export function roleFor(member: MemberView, context: BuilderContext): RoleRef {
  return member.roles.find((role) => context.mandatoryRoleIds.has(role.id))
    ?? member.roles.find((role) => context.templateRoleIds.has(role.id))
    ?? member.roles[0];
}

function slotOfMember(member: MemberView, role: RoleRef): Slot {
  return personSlot(member.user, role, roleNames(member.roles));
}

/**
 * Предзаполнение. Если документ уже отправлялся — маршрутом прошлой версии (RTE-6): люди, которые больше не в компании
 * или сняли роль, выпадают. Иначе — шаблоном: подставленные и роли с выбором из нескольких кандидатов; утверждающим
 * становится последний этап шаблона, если в нём один участник (D4). Один человек — один раз: при повторе остаётся
 * более позднее место.
 */
export function initialState(preview: RoutePreview, context: BuilderContext): BuilderState {
  const members = new Map(context.colleagues.map((member) => [member.user.id, member]));
  const fromPrevious = (person: RoutePerson): Slot | null => {
    const member = members.get(person.userId);
    const role = member?.roles.find((item) => item.id === person.roleId);
    return member && role ? slotOfMember(member, role) : null;
  };

  let state: BuilderState;
  if (preview.previous) {
    state = {
      stages: preview.previous.stages.map((stage) => ({
        id: stageId(),
        slots: stage.participants.map(fromPrevious).filter((slot): slot is Slot => slot !== null),
      })),
      endorser: preview.previous.endorser ? fromPrevious(preview.previous.endorser) : null,
    };
  } else {
    const stages: BuilderStage[] = [...preview.stages]
      .sort((left, right) => left.stageOrder - right.stageOrder)
      .map((stage) => ({
        id: stageId(),
        slots: stage.participants.flatMap((participant): Slot[] => {
          if (participant.resolution === 'AUTO' && participant.selectedUserId !== null) {
            const member = members.get(participant.selectedUserId);
            const user = participant.candidates.find((candidate) => candidate.id === participant.selectedUserId);
            return user ? [personSlot(user, participant.role, member ? roleNames(member.roles) : participant.role.name)] : [];
          }
          if (participant.resolution === 'SELECT') {
            return [{
              kind: 'choice',
              id: `c:${stage.stageOrder}:${participant.role.id}`,
              roleId: participant.role.id,
              roleName: participant.role.name,
              candidates: participant.candidates,
            }];
          }
          return [];
        }),
      }))
      .filter((stage) => stage.slots.length > 0);
    const last = stages[stages.length - 1];
    let endorser: Slot | null = null;
    if (last && last.slots.length === 1) {
      endorser = last.slots[0];
      stages.pop();
    }
    state = { stages, endorser };
  }
  return dedupe(normalize(state));
}

/** Человек в маршруте один раз: при повторе остаётся более позднее место (D6). */
function dedupe(state: BuilderState): BuilderState {
  const seen = new Set<number>();
  const keep = (slot: Slot): boolean => {
    if (slot.kind !== 'person') return true;
    if (seen.has(slot.userId)) return false;
    seen.add(slot.userId);
    return true;
  };
  const endorser = state.endorser && keep(state.endorser) ? state.endorser : null;
  const stages = [...state.stages].reverse().map((stage) => ({ ...stage, slots: [...stage.slots].reverse().filter(keep).reverse() })).reverse();
  return normalize({ stages, endorser });
}

/** Пустые этапы исчезают сами (RTE-4). */
export function normalize(state: BuilderState): BuilderState {
  return { stages: state.stages.filter((stage) => stage.slots.length > 0), endorser: state.endorser };
}

function allSlots(state: BuilderState): Slot[] {
  return [...state.stages.flatMap((stage) => stage.slots), ...(state.endorser ? [state.endorser] : [])];
}

/** Нельзя убрать: обязательная роль, и в маршруте она больше ни у кого (замок = «нельзя удалить»). */
export function isLocked(state: BuilderState, slot: Slot, context: BuilderContext): boolean {
  if (!context.mandatoryRoleIds.has(slot.roleId)) return false;
  return allSlots(state).filter((other) => other.roleId === slot.roleId).length <= 1;
}

/** Где человек уже стоит — подпись неактивного варианта в списке сотрудников (RTE-3). */
export function placeOf(state: BuilderState, userId: number): string | null {
  if (state.endorser?.kind === 'person' && state.endorser.userId === userId) return 'уже утверждает';
  const index = state.stages.findIndex((stage) => stage.slots.some((slot) => slot.kind === 'person' && slot.userId === userId));
  return index >= 0 ? `уже в маршруте, этап ${index + 1}` : null;
}

function withoutSlot(state: BuilderState, slotId: string): BuilderState {
  return {
    stages: state.stages.map((stage) => ({ ...stage, slots: stage.slots.filter((slot) => slot.id !== slotId) })),
    endorser: state.endorser?.id === slotId ? null : state.endorser,
  };
}

function findSlot(state: BuilderState, slotId: string): Slot | null {
  return allSlots(state).find((slot) => slot.id === slotId) ?? null;
}

/**
 * Поставить место в цель. Если утверждающий уже есть, прежний не исчезает, а становится последним этапом согласования:
 * обязательный директор, которого сменили на утверждении, остаётся в маршруте (D4).
 */
function place(state: BuilderState, slot: Slot, target: Target): BuilderState {
  if (target.kind === 'endorser') {
    const previous = state.endorser;
    const stages = previous ? [...state.stages, { id: stageId(), slots: [previous] }] : state.stages;
    return { stages, endorser: slot };
  }
  if (target.kind === 'newStage') {
    const stages = [...state.stages];
    stages.splice(Math.max(0, Math.min(target.index, stages.length)), 0, { id: stageId(), slots: [slot] });
    return { ...state, stages };
  }
  const stages = state.stages.map((stage, index) => (index === target.index ? { ...stage, slots: [...stage.slots, slot] } : stage));
  return { ...state, stages };
}

export function moveSlot(state: BuilderState, slotId: string, target: Target): BuilderState {
  const slot = findSlot(state, slotId);
  if (!slot) return state;
  // Индекс цели — в координатах до удаления: этап, из которого ушёл последний человек, исчезнет только после вставки.
  const removed = withoutSlot(state, slotId);
  return normalize(place(removed, slot, target));
}

export function addPerson(state: BuilderState, member: MemberView, target: Target, context: BuilderContext): BuilderState {
  if (placeOf(state, member.user.id)) return state;
  return normalize(place(state, slotOfMember(member, roleFor(member, context)), target));
}

export function removeSlot(state: BuilderState, slotId: string, context: BuilderContext): BuilderState {
  const slot = findSlot(state, slotId);
  if (!slot || isLocked(state, slot, context)) return state;
  return normalize(withoutSlot(state, slotId));
}

/** Выбрать человека для роли с несколькими кандидатами — место остаётся тем же. */
export function resolveChoice(state: BuilderState, slotId: string, user: UserRef, context: BuilderContext): BuilderState {
  const slot = findSlot(state, slotId);
  if (!slot || slot.kind !== 'choice' || placeOf(state, user.id)) return state;
  const member = context.colleagues.find((item) => item.user.id === user.id);
  const resolved = personSlot(user, { id: slot.roleId, code: '', name: slot.roleName }, member ? roleNames(member.roles) : slot.roleName);
  const swap = (item: Slot) => (item.id === slotId ? resolved : item);
  return {
    stages: state.stages.map((stage) => ({ ...stage, slots: stage.slots.map(swap) })),
    endorser: state.endorser ? swap(state.endorser) : null,
  };
}

export function moveStage(state: BuilderState, index: number, delta: -1 | 1): BuilderState {
  const to = index + delta;
  if (to < 0 || to >= state.stages.length) return state;
  const stages = [...state.stages];
  [stages[index], stages[to]] = [stages[to], stages[index]];
  return { ...state, stages };
}

/** Что мешает отправить; пусто — можно. */
export function problemsOf(state: BuilderState): string[] {
  const problems: string[] = [];
  const choices = allSlots(state).filter((slot) => slot.kind === 'choice');
  if (choices.length > 0) {
    problems.push(`Выберите сотрудника: ${choices.map((slot) => `«${slot.roleName}»`).join(', ')}`);
  }
  return problems;
}

/** Тело запроса отправки; null — остались роли без выбранного человека. */
export function toSubmit(state: BuilderState): { stages: { participants: RoutePerson[] }[]; endorser: RoutePerson | null } | null {
  if (problemsOf(state).length > 0) return null;
  const person = (slot: Slot): RoutePerson => {
    if (slot.kind !== 'person') throw new Error('unresolved choice');
    return { userId: slot.userId, roleId: slot.roleId };
  };
  return {
    stages: state.stages.map((stage) => ({ participants: stage.slots.map(person) })),
    endorser: state.endorser ? person(state.endorser) : null,
  };
}
