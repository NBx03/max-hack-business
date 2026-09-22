import { useMemo, useState } from 'react';
import { Button, Spinner, Typography } from '@maxhub/max-ui';
import { useNavigate, useParams } from 'react-router-dom';
import { getRoutePreview, submitDocument, type RouteSelection } from '../../api/documents';
import type { DocumentStatus, RoutePreviewParticipant } from '../../api/types';
import { BottomActionBar, CenteredColumn, ScreenShell } from '../../components/base/Layout';
import { ErrorState, ErrorText } from '../../components/base/StateCard';
import { useAsync } from '../../hooks/useAsync';
import { errorMessage } from '../../api/errors';
import { documentCardPath } from '../../routes/paths';

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

/** 12. Предпросмотр маршрута (docs/SCREENS.md). */
export function RoutePreviewScreen() {
  const { id } = useParams<{ id: string }>();
  const documentId = Number(id);
  const navigate = useNavigate();

  const query = useAsync(() => getRoutePreview(documentId), [documentId]);
  const [selections, setSelections] = useState<Map<string, number>>(new Map());
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

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const selectionList: RouteSelection[] = [...selections.entries()].map(([key, userId]) => {
        const [stageOrder, roleId] = key.split(':').map(Number);
        return { stageOrder, roleId, userId };
      });
      const submitted = await submitDocument(documentId, selectionList.length > 0 ? { selections: selectionList } : {});
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
        <Typography.Headline variant="large-strong">Предпросмотр маршрута</Typography.Headline>

        {data.problems.map((problem) => (
          <div
            key={problem.code}
            style={{
              padding: 12,
              borderRadius: 8,
              background: 'var(--status-danger-bg)',
              color: 'var(--status-danger-fg)',
              fontSize: 13,
            }}
          >
            {problem.message}
          </div>
        ))}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 16 }}>
          {data.stages.map((stage) => (
            <div key={stage.stageOrder} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Typography.Text>Этап {stage.stageOrder}</Typography.Text>
              {stage.participants.map((participant) => (
                <ParticipantRow
                  key={participant.role.id}
                  participant={participant}
                  selectedUserId={selections.get(selectionKey(stage.stageOrder, participant.role.id)) ?? null}
                  onSelect={(userId) =>
                    setSelections((prev) => new Map(prev).set(selectionKey(stage.stageOrder, participant.role.id), userId))
                  }
                />
              ))}
            </div>
          ))}
        </div>

        {submitError && <ErrorText>{submitError}</ErrorText>}
      </CenteredColumn>

      <BottomActionBar>
        <Button stretched variant="primary" disabled={!canSubmit || submitting} onClick={() => void handleSubmit()}>
          {submitting ? <Spinner /> : 'Отправить на согласование'}
        </Button>
      </BottomActionBar>
    </ScreenShell>
  );
}

function ParticipantRow({
  participant,
  selectedUserId,
  onSelect,
}: {
  participant: RoutePreviewParticipant;
  selectedUserId: number | null;
  onSelect: (userId: number) => void;
}) {
  const needsSelection = participant.resolution === 'SELECT' && selectedUserId === null;

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
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{participant.role.name}</span>

      {participant.resolution === 'AUTO' && (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{participant.candidates[0]?.fullName}</span>
      )}

      {participant.resolution === 'SKIPPED' && (
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Пропускается: в компании нет роли</span>
      )}

      {participant.resolution === 'AUTHOR_HOLDS_ROLE' && (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Согласуете вы как {participant.role.name} — автоматически
        </span>
      )}

      {participant.resolution === 'SELECT' && (
        <select
          value={selectedUserId ?? ''}
          onChange={(event) => onSelect(Number(event.target.value))}
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid var(--divider-primary)',
            background: 'var(--background-primary)',
            color: 'var(--text-primary)',
            fontSize: 13,
          }}
        >
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
    </div>
  );
}
