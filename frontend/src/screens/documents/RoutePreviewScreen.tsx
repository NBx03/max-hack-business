import { useMemo, useState } from 'react';
import { Button, Spinner, Typography } from '@maxhub/max-ui';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getRoutePreview, submitDocument, type RouteSelection } from '../../api/documents';
import { getColleagues } from '../../api/organization';
import type { DocumentStatus, MemberView, RoutePreview, RoutePreviewParticipant, RoutePreviewStage } from '../../api/types';
import { useSession } from '../../app/SessionContext';
import { BottomSheet } from '../../components/base/BottomSheet';
import { BottomActionBar, CenteredColumn, ScreenShell } from '../../components/base/Layout';
import { ErrorState, ErrorText } from '../../components/base/StateCard';
import { useAsync } from '../../hooks/useAsync';
import { errorMessage } from '../../api/errors';
import { documentCardPath, documentCheckPath } from '../../routes/paths';
import { BackLink } from '../../components/base/BackLink';
import { inputStyle } from './DocumentFormParts';

function selectionKey(stageOrder: number, roleId: number): string {
  return `${stageOrder}:${roleId}`;
}

/**
 * Текст тоста после отправки - по статусу из ответа submitDocument, а не всегда один
 * и тот же: если решать некому (обязательная роль только у автора - AUTHOR_HOLDS_ROLE
 * на каждом шаге), документ сразу APPROVED, и "согласующие получили уведомление" было
 * бы неправдой (#71, ревью).
 */
function submitToastMessage(status: DocumentStatus): string {
  return status === 'APPROVED' ? 'Документ согласован — решать было некому' : 'Отправлено. Согласующие получили уведомление';
}

/**
 * Где стоит добавленный согласующий: вместе с этапом шаблона или отдельным этапом перед ним
 * (before на единицу больше последнего этапа — последним, после всех).
 */
type Place = { kind: 'WITH'; stageOrder: number } | { kind: 'NEW'; before: number };

type Extra = { key: string; userId: number; userName: string; roleId: number; roleName: string; place: Place };

type DisplayStage =
  | { kind: 'template'; stage: RoutePreviewStage; extras: Extra[] }
  | { kind: 'new'; before: number; extras: Extra[] };

function placeKey(place: Place): string {
  return place.kind === 'WITH' ? `with:${place.stageOrder}` : `new:${place.before}`;
}

function parsePlace(value: string): Place {
  const [kind, order] = value.split(':');
  return kind === 'with' ? { kind: 'WITH', stageOrder: Number(order) } : { kind: 'NEW', before: Number(order) };
}

function stageRoles(stage: RoutePreviewStage): string {
  return stage.participants.map((participant) => participant.role.name).join(', ');
}

/** Этапы шаблона и добавленные автором — в том порядке, в каком документ по ним пойдёт. */
function displayStages(stages: RoutePreviewStage[], extras: Extra[]): DisplayStage[] {
  const result: DisplayStage[] = [];
  const newBefore = (order: number) => extras.filter((extra) => extra.place.kind === 'NEW' && extra.place.before === order);
  for (const stage of stages) {
    const before = newBefore(stage.stageOrder);
    if (before.length > 0) result.push({ kind: 'new', before: stage.stageOrder, extras: before });
    result.push({
      kind: 'template',
      stage,
      extras: extras.filter((extra) => extra.place.kind === 'WITH' && extra.place.stageOrder === stage.stageOrder),
    });
  }
  const last = afterLast(stages);
  const atEnd = newBefore(last);
  if (atEnd.length > 0) result.push({ kind: 'new', before: last, extras: atEnd });
  return result;
}

function afterLast(stages: RoutePreviewStage[]): number {
  return Math.max(0, ...stages.map((stage) => stage.stageOrder)) + 1;
}

/**
 * 12. Предпросмотр маршрута (docs/SCREENS.md). Маршрут вида документа задан в компании, а автор может его
 * расширить: добавить согласующего вместе с любым этапом или отдельным этапом — в том числе последним, после
 * директора (приёмка 24.09, п. 2 и 12). Убрать обязательных нельзя: маршрут только растёт (CLAUDE.md).
 */
export function RoutePreviewScreen() {
  const { id } = useParams<{ id: string }>();
  const documentId = Number(id);
  const navigate = useNavigate();
  // С экрана проверки («К маршруту» при создании документа) «назад» ведёт туда же, а не через него на карточку
  // (ревью #96, вопрос 1).
  const fromCheck = (useLocation().state as { from?: string } | null)?.from === 'check';

  const query = useAsync(() => getRoutePreview(documentId), [documentId]);
  const [selections, setSelections] = useState<Map<string, number>>(new Map());
  const [extras, setExtras] = useState<Extra[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const pendingSelectCount = useMemo(() => {
    if (query.status !== 'ready') {
      return 0;
    }
    let count = 0;
    for (const stage of query.data.stages) {
      for (const participant of stage.participants) {
        if (participant.resolution === 'SELECT' && !selections.has(selectionKey(stage.stageOrder, participant.role.id))) {
          count += 1;
        }
      }
    }
    return count;
  }, [query, selections]);

  if (query.status === 'loading') {
    return (
      <CenteredColumn style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </CenteredColumn>
    );
  }

  if (query.status === 'error') {
    return (
      <CenteredColumn style={{ padding: 16 }}>
        <ErrorState message={errorMessage(query.error)} onRetry={query.refresh} />
      </CenteredColumn>
    );
  }

  const data = query.data;
  const canSubmit = data.problems.length === 0 && pendingSelectCount === 0;
  const stages = displayStages(data.stages, extras);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const selectionList: RouteSelection[] = [...selections.entries()].map(([key, userId]) => {
        const [stageOrder, roleId] = key.split(':').map(Number);
        return { stageOrder, roleId, userId };
      });
      const extraList: RouteSelection[] = extras.map((extra) =>
        extra.place.kind === 'WITH'
          ? { stageOrder: extra.place.stageOrder, roleId: extra.roleId, userId: extra.userId }
          : { stageOrder: extra.place.before, roleId: extra.roleId, userId: extra.userId, newStage: true });
      const submitted = await submitDocument(documentId, {
        ...(selectionList.length > 0 ? { selections: selectionList } : {}),
        ...(extraList.length > 0 ? { extraApprovers: extraList } : {}),
      });
      navigate(documentCardPath(documentId), { state: { toast: submitToastMessage(submitted.status) } });
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenShell>
      <CenteredColumn style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        <BackLink
          to={fromCheck ? documentCheckPath(documentId) : documentCardPath(documentId)}
          label={fromCheck ? 'К проверке' : 'К документу'}
        />
        <Typography.Headline variant="large-strong">Маршрут</Typography.Headline>
        <Typography.Text style={{ color: 'var(--text-secondary)' }}>
          Этапы идут по очереди, участники одного этапа — одновременно. Можно добавить согласующих, убрать
          обязательных нельзя.
        </Typography.Text>

        {data.problems.map((problem) => (
          <div
            key={problem.code}
            style={{
              padding: 12,
              borderRadius: 8,
              background: 'var(--status-danger-bg)',
              color: 'var(--status-danger-fg)',
              fontSize: 14,
            }}
          >
            {problem.message}
          </div>
        ))}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {stages.map((display, index) => (
            <div key={display.kind === 'new' ? `new-${display.before}` : `t-${display.stage.stageOrder}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Typography.Text>
                Этап {index + 1}
                {display.kind === 'new' ? ' · добавлен вами' : ''}
              </Typography.Text>
              {display.kind === 'template' &&
                display.stage.participants.map((participant) => (
                  <ParticipantRow
                    key={participant.role.id}
                    participant={participant}
                    carryOver={data.carryOver}
                    selectedUserId={selections.get(selectionKey(display.stage.stageOrder, participant.role.id)) ?? null}
                    onSelect={(userId) =>
                      setSelections((prev) => new Map(prev).set(selectionKey(display.stage.stageOrder, participant.role.id), userId))
                    }
                  />
                ))}
              {display.extras.map((extra) => (
                <ExtraRow key={extra.key} extra={extra} onRemove={() => setExtras((prev) => prev.filter((item) => item.key !== extra.key))} />
              ))}
            </div>
          ))}
        </div>

        <Button variant="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setAddOpen(true)}>
          + Добавить согласующего
        </Button>

        {submitError && <ErrorText>{submitError}</ErrorText>}
        <div style={{ height: 8 }} />
      </CenteredColumn>

      <BottomActionBar>
        <Button stretched variant="primary" disabled={!canSubmit || submitting} onClick={() => void handleSubmit()}>
          {submitting ? <Spinner /> : 'Отправить на согласование'}
        </Button>
      </BottomActionBar>

      <AddApproverSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        preview={data}
        onAdd={(extra) => {
          // Тот же человек в той же роли на том же месте — не дубль, а то же самое (ревью #97).
          setExtras((prev) => (prev.some((item) => item.key === extra.key) ? prev : [...prev, extra]));
          setAddOpen(false);
        }}
      />
    </ScreenShell>
  );
}

function ParticipantRow({
  participant,
  carryOver,
  selectedUserId,
  onSelect,
}: {
  participant: RoutePreviewParticipant;
  carryOver: RoutePreview['carryOver'];
  selectedUserId: number | null;
  onSelect: (userId: number) => void;
}) {
  const needsSelection = participant.resolution === 'SELECT' && selectedUserId === null;
  const who = participant.resolution === 'AUTO' ? participant.candidates[0]?.id ?? null : selectedUserId;
  const carried = carryOver !== null && who !== null
    && carryOver.approvals.some((approval) => approval.roleId === participant.role.id && approval.userId === who);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 12,
        borderRadius: 8,
        border: needsSelection ? '1px solid var(--status-progress-fg)' : '1px solid var(--divider-primary)',
        background: needsSelection ? 'var(--status-progress-bg)' : 'var(--background-secondary)',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{participant.role.name}</span>

      {participant.resolution === 'AUTO' && (
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{participant.candidates[0]?.fullName}</span>
      )}

      {participant.resolution === 'SKIPPED' && (
        <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Пропускается: в компании нет роли</span>
      )}

      {participant.resolution === 'AUTHOR_HOLDS_ROLE' && (
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Согласуете вы как {participant.role.name} — автоматически
        </span>
      )}

      {participant.resolution === 'SELECT' && (
        <select value={selectedUserId ?? ''} onChange={(event) => onSelect(Number(event.target.value))} style={inputStyle}>
          <option value="" disabled>
            Выберите человека
          </option>
          {participant.candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.fullName}
            </option>
          ))}
        </select>
      )}

      {carried && carryOver && (
        <span style={{ fontSize: 13, color: 'var(--status-success-fg)' }}>
          Согласие по версии {carryOver.fromVersionNo} сохранится — документ не менялся
        </span>
      )}
    </div>
  );
}

function ExtraRow({ extra, onRemove }: { extra: Extra; onRemove: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: 12,
        borderRadius: 8,
        border: '1px dashed var(--divider-primary)',
        background: 'var(--background-secondary)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{extra.roleName}</span>
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{extra.userName}</span>
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>добавлен вами</span>
      </div>
      {/* Кнопка не сжимается: иначе на узком экране от неё оставалось «Убр…» (как «Изме…» на приёмке). */}
      <div style={{ flex: 'none', whiteSpace: 'nowrap' }}>
        <Button size="small" variant="secondary" onClick={onRemove} aria-label={`Убрать ${extra.userName}`}>
          Убрать
        </Button>
      </div>
    </div>
  );
}

/** Кого и куда добавить: сотрудник в одной из своих ролей и место в маршруте. */
function AddApproverSheet({
  open,
  onClose,
  preview,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  preview: RoutePreview;
  onAdd: (extra: Extra) => void;
}) {
  const { me } = useSession();
  const authorId = me?.actingAs ? me.actingAs.user.id : me?.user.id;
  const colleagues = useAsync(() => (open ? getColleagues() : Promise.resolve<MemberView[]>([])), [open]);
  const [person, setPerson] = useState('');
  const last = afterLast(preview.stages);
  const [place, setPlace] = useState(`new:${last}`);

  const options = colleagues.status === 'ready'
    ? colleagues.data
        .filter((member) => member.user.id !== authorId)
        .flatMap((member) => member.roles.map((role) => ({
          value: `${member.user.id}:${role.id}`,
          label: `${member.user.fullName} — ${role.name}`,
          member,
          role,
        })))
    : [];
  const places: { value: string; label: string }[] = [];
  preview.stages.forEach((stage, index) => {
    places.push({
      value: `new:${stage.stageOrder}`,
      label: index === 0 ? `Первым — до «${stageRoles(stage)}»` : `Отдельно, перед «${stageRoles(stage)}»`,
    });
    places.push({ value: `with:${stage.stageOrder}`, label: `Вместе с «${stageRoles(stage)}»` });
  });
  places.push({ value: `new:${last}`, label: 'Последним — после всех' });

  const chosen = options.find((option) => option.value === person);

  return (
    <BottomSheet open={open} onClose={onClose} title="Добавить согласующего">
      {colleagues.status === 'loading' && <Spinner />}
      {colleagues.status === 'error' && <ErrorText>{errorMessage(colleagues.error)}</ErrorText>}
      {colleagues.status === 'ready' && options.length === 0 && (
        <Typography.Text style={{ color: 'var(--text-secondary)' }}>
          Добавить некого: у других сотрудников нет ролей. Роли назначает администратор.
        </Typography.Text>
      )}
      {options.length > 0 && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Кто</span>
            <select style={inputStyle} value={person} onChange={(event) => setPerson(event.target.value)}>
              <option value="" disabled>
                Выберите сотрудника
              </option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Когда согласует</span>
            <select style={inputStyle} value={place} onChange={(event) => setPlace(event.target.value)}>
              {places.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            stretched
            variant="primary"
            disabled={!chosen}
            onClick={() => {
              if (!chosen) return;
              const parsed = parsePlace(place);
              onAdd({
                key: `${chosen.value}@${placeKey(parsed)}`,
                userId: chosen.member.user.id,
                userName: chosen.member.user.fullName,
                roleId: chosen.role.id,
                roleName: chosen.role.name,
                place: parsed,
              });
              setPerson('');
            }}
          >
            Добавить
          </Button>
        </>
      )}
    </BottomSheet>
  );
}
