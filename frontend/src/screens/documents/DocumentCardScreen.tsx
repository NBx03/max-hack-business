import { useState } from 'react';
import { Button, Spinner, Textarea, Typography } from '@maxhub/max-ui';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { decideStep, getDocument, type StepDecisionAction } from '../../api/documents';
import { ApiError, errorMessage } from '../../api/errors';
import type { DocumentCard, RouteStage, RouteView, StepView } from '../../api/types';
import { BottomActionBar, CenteredColumn } from '../../components/base/Layout';
import { BottomSheet, ConfirmSheet } from '../../components/base/BottomSheet';
import { DocumentStatusBadge, StepDecisionBadge } from '../../components/base/StatusBadge';
import { AccessErrorState, ErrorState } from '../../components/base/StateCard';
import { Toast } from '../../components/base/Toast';
import { formatFileSize } from '../../components/base/FilePicker';
import { useAsync } from '../../hooks/useAsync';
import { downloadFile } from '../../max/webApp';
import { documentNewVersionPath, routePreviewPath } from '../../routes/paths';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Последнее решение RETURNED - в текущем маршруте или в истории прошлых версий. */
function findReturnReason(route: RouteView | null): StepView | null {
  if (!route) {
    return null;
  }
  const steps = [...route.stages.flatMap((stage) => stage.steps), ...route.history];
  const returned = steps.filter((step) => step.decision === 'RETURNED');
  return returned.reduce<StepView | null>((latest, step) => {
    if (!latest) return step;
    return (step.decidedAt ?? '') > (latest.decidedAt ?? '') ? step : latest;
  }, null);
}

function findStep(route: RouteView | null, stepId: number): StepView | null {
  if (!route) {
    return null;
  }
  return route.stages.flatMap((stage) => stage.steps).find((step) => step.id === stepId) ?? null;
}

type DecisionDialog = { stepId: number; role: string; action: 'RETURN' | 'REJECT' };

/** 11. Карточка документа (docs/SCREENS.md). */
export function DocumentCardScreen() {
  const { id } = useParams<{ id: string }>();
  const documentId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();

  const query = useAsync(() => getDocument(documentId), [documentId]);

  const [toast, setToast] = useState<string | null>((location.state as { toast?: string } | null)?.toast ?? null);
  const [decisionDialog, setDecisionDialog] = useState<DecisionDialog | null>(null);
  const [rejectStep2, setRejectStep2] = useState(false);
  const [comment, setComment] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  function dismissToast() {
    setToast(null);
    if (location.state) {
      navigate(location.pathname, { replace: true });
    }
  }

  function closeDialog() {
    setDecisionDialog(null);
    setRejectStep2(false);
    setComment('');
    setDecisionError(null);
  }

  async function submitDecision(action: StepDecisionAction, stepId: number, decisionComment?: string) {
    setDecisionBusy(true);
    setDecisionError(null);
    try {
      await decideStep(stepId, action, decisionComment);
      if (action === 'RETURN') {
        setToast('Документ возвращён автору');
      } else if (action === 'REJECT') {
        setToast('Документ отклонён');
      }
      closeDialog();
      query.refresh();
    } catch (err) {
      setDecisionError(errorMessage(err));
    } finally {
      setDecisionBusy(false);
    }
  }

  if (query.status === 'loading') {
    return (
      <CenteredColumn style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </CenteredColumn>
    );
  }

  if (query.status === 'error') {
    const { error } = query;
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      return (
        <CenteredColumn style={{ padding: 16 }}>
          <AccessErrorState text="Документ недоступен или удалён" />
        </CenteredColumn>
      );
    }
    return (
      <CenteredColumn style={{ padding: 16 }}>
        <ErrorState message={errorMessage(error)} onRetry={query.refresh} />
      </CenteredColumn>
    );
  }

  const doc = query.data;
  const returnReason = doc.status === 'RETURNED' ? findReturnReason(doc.route) : null;
  const currentVersion = doc.versions.find((v) => v.versionNo === doc.currentVersionNo);
  const activeSteps = doc.myActiveStepIds.map((stepId) => findStep(doc.route, stepId)).filter((s): s is StepView => s !== null);

  return (
    <CenteredColumn style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <Typography.Title variant="large-strong">{doc.title}</Typography.Title>
          <DocumentStatusBadge status={doc.status} />
        </div>
        <Typography.Text>
          {doc.type.name} · {doc.author.fullName} · Версия {doc.currentVersionNo}
        </Typography.Text>
      </div>

      {returnReason && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: 'var(--status-warning-bg)',
            color: 'var(--status-warning-fg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>Причина возврата</span>
          <span style={{ fontSize: 13 }}>
            {returnReason.approver.fullName}
            {returnReason.decidedAt ? `, ${formatDateTime(returnReason.decidedAt)}` : ''}
          </span>
          {returnReason.comment && <span style={{ fontSize: 13 }}>{returnReason.comment}</span>}
        </div>
      )}

      {doc.route && <RouteStages route={doc.route} />}

      {currentVersion && currentVersion.files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Typography.Text>Файлы</Typography.Text>
          {currentVersion.files.map((file) => (
            <button
              key={file.id}
              type="button"
              onClick={() => downloadFile(file.downloadUrl, file.fileName)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: 10,
                borderRadius: 8,
                border: '1px solid var(--divider-primary)',
                background: 'var(--background-secondary)',
                color: 'var(--text-primary)',
                fontSize: 13,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span>{file.fileName}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>{formatFileSize(file.size)}</span>
            </button>
          ))}
        </div>
      )}

      {doc.check && <CheckSummary issueCount={doc.check.issues.length} />}

      <HistoryAndVersions doc={doc} />

      {/* Кнопки внизу - по permissions/myActiveStepIds (docs/SCREENS.md, экран 11). */}
      {activeSteps.length > 0 && (
        <BottomActionBar>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeSteps.map((step) => (
              <div key={step.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeSteps.length > 1 && <Typography.Text>Ваше решение как «{step.role.name}»</Typography.Text>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button stretched variant="primary" disabled={decisionBusy} onClick={() => void submitDecision('APPROVE', step.id)}>
                    Согласовать
                  </Button>
                  <Button
                    stretched
                    variant="secondary"
                    disabled={decisionBusy}
                    onClick={() => {
                      setDecisionDialog({ stepId: step.id, role: step.role.name, action: 'RETURN' });
                      setComment('');
                    }}
                  >
                    Вернуть
                  </Button>
                  <Button
                    stretched
                    variant="destructive"
                    disabled={decisionBusy}
                    onClick={() => {
                      setDecisionDialog({ stepId: step.id, role: step.role.name, action: 'REJECT' });
                      setComment('');
                    }}
                  >
                    Отклонить
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </BottomActionBar>
      )}

      {doc.status === 'DRAFT' && doc.permissions.canSubmit && (
        <BottomActionBar>
          <Button stretched variant="primary" onClick={() => navigate(routePreviewPath(doc.id))}>
            К маршруту
          </Button>
        </BottomActionBar>
      )}

      {doc.status === 'RETURNED' && doc.permissions.canUploadVersion && (
        <BottomActionBar>
          <Button stretched variant="primary" onClick={() => navigate(documentNewVersionPath(doc.id))}>
            Загрузить исправленную версию
          </Button>
        </BottomActionBar>
      )}

      {toast && <Toast message={toast} onDismiss={dismissToast} />}

      <BottomSheet
        open={decisionDialog !== null && !rejectStep2}
        onClose={closeDialog}
        title={decisionDialog?.action === 'RETURN' ? 'Вернуть на доработку' : 'Отклонить документ'}
      >
        <Typography.Text>Комментарий</Typography.Text>
        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Опишите, что нужно исправить"
        />
        <Typography.Text>Комментарий обязателен — без него отправить нельзя</Typography.Text>
        {decisionError && <ErrorState message={decisionError} onRetry={() => setDecisionError(null)} />}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Button stretched variant="secondary" onClick={closeDialog}>
              Отмена
            </Button>
          </div>
          <div style={{ flex: 1 }}>
            <Button
              stretched
              variant={decisionDialog?.action === 'REJECT' ? 'destructive' : 'primary'}
              disabled={!comment.trim() || decisionBusy}
              onClick={() => {
                if (decisionDialog?.action === 'REJECT') {
                  setRejectStep2(true);
                } else if (decisionDialog) {
                  void submitDecision('RETURN', decisionDialog.stepId, comment.trim());
                }
              }}
            >
              {decisionDialog?.action === 'RETURN' ? 'Вернуть' : 'Отклонить'}
            </Button>
          </div>
        </div>
      </BottomSheet>

      <ConfirmSheet
        open={decisionDialog !== null && rejectStep2}
        onClose={() => setRejectStep2(false)}
        title="Отклонение окончательное"
        description="Дальше пути для этого документа нет."
        confirmLabel="Отклонить"
        destructive
        onConfirm={() => {
          if (decisionDialog) {
            void submitDecision('REJECT', decisionDialog.stepId, comment.trim());
          }
        }}
      />
    </CenteredColumn>
  );
}

function RouteStages({ route }: { route: RouteView }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Typography.Text>Маршрут</Typography.Text>
      {route.stages.map((stage) => (
        <StageGroup key={stage.stageOrder} stage={stage} />
      ))}
    </div>
  );
}

function StageGroup({ stage }: { stage: RouteStage }) {
  const parallel = stage.steps.length > 1;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        borderRadius: 8,
        border: stage.state === 'ACTIVE' ? '1px solid var(--status-progress-fg)' : '1px solid var(--divider-primary)',
        background: 'var(--background-secondary)',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
        Этап {stage.stageOrder}
        {parallel ? ' — согласуют параллельно' : ''}
      </span>
      {stage.steps.map((step) => (
        <div key={step.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            {step.role.name} — {step.approver.fullName}
          </span>
          <StepDecisionBadge decision={step.decision} autoReason={step.autoReason} />
        </div>
      ))}
    </div>
  );
}

// Свёрнуто, со счётчиком - сам список замечаний остаётся на экране 10 (#55),
// сюда его текст переносить не нужно.
function CheckSummary({ issueCount }: { issueCount: number }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: 10,
        borderRadius: 8,
        border: '1px solid var(--divider-primary)',
        color: 'var(--text-primary)',
        fontSize: 13,
      }}
    >
      <span>Замечания проверки</span>
      <span style={{ color: 'var(--text-tertiary)' }}>{issueCount === 0 ? 'нет' : issueCount}</span>
    </div>
  );
}

function HistoryAndVersions({ doc }: { doc: DocumentCard }) {
  // "История: решения с комментариями и номером версии; прошлые версии" (docs/SCREENS.md,
  // экран 11) - решения берём из текущего маршрута (уже закрытые этапы) и из route.history
  // (прошлые версии), а не только из history: иначе решения по текущей версии,
  // принятые до активного этапа, никогда бы не попали в список.
  const decidedSteps = doc.route
    ? [...doc.route.stages.flatMap((stage) => stage.steps), ...doc.route.history].filter((step) => step.decision !== 'PENDING')
    : [];
  const sortedSteps = decidedSteps.slice().sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Typography.Text>История</Typography.Text>
      {sortedSteps.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Решений пока нет</span>}
      {sortedSteps.map((step) => (
        <div key={step.id} style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          Версия {step.versionNo} · {step.approver.fullName} ({step.role.name}) —{' '}
          <StepDecisionBadge decision={step.decision} autoReason={step.autoReason} />
          {step.comment ? `: ${step.comment}` : ''}
        </div>
      ))}

      <Typography.Text>Версии</Typography.Text>
      {doc.versions
        .slice()
        .reverse()
        .map((version) => (
          <div key={version.versionNo} style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Версия {version.versionNo} — загружена {formatDateTime(version.createdAt)}, {version.createdBy.fullName}
          </div>
        ))}
    </div>
  );
}
