import { useState } from 'react';
import { Button, CellList, CellSimple, Spinner, Textarea, Typography } from '@maxhub/max-ui';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  createDocumentVersion,
  createFormVersion,
  decideStep,
  getDocument,
  getDocumentTypes,
  withdrawDocument,
  type StepDecisionAction,
} from '../../api/documents';
import { ApiError, errorMessage } from '../../api/errors';
import type { DocumentCard, DocumentTypeField, FileRef, RouteStage, RouteView, StepView, VersionChanges } from '../../api/types';
import { BottomActionBar, CenteredColumn, ScreenShell } from '../../components/base/Layout';
import { BottomSheet, ConfirmSheet } from '../../components/base/BottomSheet';
import { DocumentStatusBadge, StepDecisionBadge } from '../../components/base/StatusBadge';
import { AccessErrorState, ErrorState, ErrorText } from '../../components/base/StateCard';
import { Toast } from '../../components/base/Toast';
import { formatFileSize } from '../../components/base/FilePicker';
import { useAsync } from '../../hooks/useAsync';
import { downloadFile } from '../../max/webApp';
import { BackLink } from '../../components/base/BackLink';
import { ROUTE_PATTERNS, documentCheckPath, routePreviewPath } from '../../routes/paths';

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

/** Согласующий текущей версии выбыл (исключён или снята роль) — поэтому документ и вернулся автору. */
function findRemovedApprover(route: RouteView | null, versionNo: number): StepView | null {
  if (!route) return null;
  return route.stages.flatMap((stage) => stage.steps)
    .find((step) => step.versionNo === versionNo && step.autoReason === 'MEMBER_REMOVED') ?? null;
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
  // Подписи полей нужны только документу-форме (#59): вместо файлов карточка показывает саму записку.
  const formContent = query.status === 'ready'
    ? query.data.versions.find((version) => version.versionNo === query.data.currentVersionNo)?.content ?? null
    : null;
  const isForm = formContent !== null;
  const types = useAsync(() => (isForm ? getDocumentTypes() : Promise.resolve([])), [isForm]);

  const [toast, setToast] = useState<string | null>((location.state as { toast?: string } | null)?.toast ?? null);
  const [decisionDialog, setDecisionDialog] = useState<DecisionDialog | null>(null);
  const [rejectStep2, setRejectStep2] = useState(false);
  const [comment, setComment] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  /**
   * Ссылка на скачивание живёт 15 минут (downloadExpiresAt). Если карточка открыта дольше,
   * перед скачиванием берём свежую ссылку, иначе человек получил бы ошибку вместо файла (ревью #71).
   */
  async function download(file: FileRef) {
    const expiresSoon = new Date(file.downloadExpiresAt).getTime() - Date.now() < 30_000;
    if (!expiresSoon) {
      downloadFile(file.downloadUrl, file.fileName);
      return;
    }
    try {
      const fresh = await getDocument(documentId);
      const freshFile = fresh.versions.flatMap((version) => version.files).find((item) => item.id === file.id);
      downloadFile((freshFile ?? file).downloadUrl, file.fileName);
    } catch (err) {
      setDecisionError(errorMessage(err));
    }
  }

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
      // Второй шаг (ConfirmSheet у "Отклонить") не показывает ошибку сам - откатываемся
      // на первый лист с комментарием, там decisionError уже отрисовывается.
      setRejectStep2(false);
      setDecisionError(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) {
        // Шаг уже неактивен (STEP_NOT_ACTIVE) - другой согласующий решил раньше.
        // Карточка должна сразу показать новый статус, а не оставаться со старыми
        // кнопками, как будто ничего не произошло.
        query.refresh();
      }
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
          <AccessErrorState
            text="Документ недоступен или удалён"
            actionLabel="К документам"
            onAction={() => navigate(ROUTE_PATTERNS.documents, { replace: true })}
          />
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
  const currentVersion = doc.versions.find((v) => v.versionNo === doc.currentVersionNo);
  const withdrawnAt = doc.status === 'RETURNED' ? currentVersion?.withdrawnAt ?? null : null;
  const removedApprover = doc.status === 'RETURNED' && !withdrawnAt ? findRemovedApprover(doc.route, doc.currentVersionNo) : null;
  const returnReason = doc.status === 'RETURNED' && !withdrawnAt && !removedApprover ? findReturnReason(doc.route) : null;

  /**
   * «Отправить заново без изменений» (приёмка 24.09, п. 1): новая версия с теми же файлами и полями — и сразу
   * к маршруту. Так документ, вернувшийся из-за маршрута, а не из-за текста, уходит дальше в два нажатия,
   * а одобрения прошлой версии сохраняются: содержимое то же самое.
   */
  async function resendUnchanged() {
    const current = doc.versions.find((version) => version.versionNo === doc.currentVersionNo);
    setResendBusy(true);
    setResendError(null);
    try {
      const sensitive = current?.containsSensitive ?? false;
      // Записка-форма (#59) — той же формой: версия «с теми же файлами» потеряла бы её содержимое.
      const draft = current?.content
        ? await createFormVersion(doc.id, { content: current.content, containsSensitive: sensitive })
        : await createDocumentVersion(doc.id, {
          containsSensitive: sensitive,
          keepFileIds: current?.files.map((file) => file.id) ?? [],
          fields: sensitive ? Object.fromEntries(doc.check?.fields.map((field) => [field.name, field.value ?? '']) ?? []) : undefined,
        });
      navigate(draft.permissions.canSubmit ? routePreviewPath(doc.id) : documentCheckPath(doc.id));
    } catch (err) {
      setResendError(errorMessage(err));
    } finally {
      setResendBusy(false);
    }
  }

  async function withdraw() {
    setWithdrawBusy(true);
    setWithdrawError(null);
    try {
      await withdrawDocument(doc.id);
      setWithdrawOpen(false);
      setToast('Документ отозван с согласования');
      query.refresh();
    } catch (err) {
      setWithdrawError(errorMessage(err));
      // 409 — документ уже решили: карточка должна показать новый статус, а не прежние кнопки.
      if (err instanceof ApiError && err.status === 409) query.refresh();
    } finally {
      setWithdrawBusy(false);
    }
  }
  const activeSteps = doc.myActiveStepIds.map((stepId) => findStep(doc.route, stepId)).filter((s): s is StepView => s !== null);

  return (
    <ScreenShell>
      <CenteredColumn style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        <BackLink to={ROUTE_PATTERNS.documents} label="Документы" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <Typography.Headline variant="large-strong">{doc.title}</Typography.Headline>
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

      {withdrawnAt && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: 'var(--status-neutral-bg)',
            color: 'var(--status-neutral-fg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>Отозван автором с согласования</span>
          <span style={{ fontSize: 13 }}>
            {formatDateTime(withdrawnAt)}. После правки отправьте заново.
          </span>
        </div>
      )}
      {removedApprover && (
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
          <span style={{ fontSize: 14, fontWeight: 600 }}>Вернулся автоматически</span>
          <span style={{ fontSize: 14 }}>
            {removedApprover.approver.fullName} больше не согласует как «{removedApprover.role.name}». Отправьте заново —
            маршрут подберёт другого, прежние согласия сохранятся.
          </span>
        </div>
      )}
      {withdrawError && !withdrawOpen && <ErrorText>{withdrawError}</ErrorText>}
      {resendError && <ErrorText>{resendError}</ErrorText>}

      {/* Не внутри блока activeSteps ("Согласовать" у него своего диалога нет) - иначе
          409 STEP_NOT_ACTIVE после query.refresh() был бы виден максимум на миг: шаг
          пропадает из myActiveStepIds вместе с баннером, который был бы вложен туда (#71, ревью). */}
      {decisionError && decisionDialog === null && <ErrorText>{decisionError}</ErrorText>}

      {doc.changes && doc.status !== 'DRAFT' && <ChangesSummary changes={doc.changes} isForm={isForm} />}

      {doc.route && <RouteStages route={doc.route} />}

      {formContent && (
        <FormContent
          content={formContent}
          definitions={types.status === 'ready' ? types.data.find((type) => type.id === doc.type.id)?.fields ?? [] : []}
        />
      )}

      {currentVersion && currentVersion.files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Typography.Text>Файлы</Typography.Text>
          <CellList mode="full-width">
            {currentVersion.files.map((file, index) => (
              <CellSimple
                key={file.id}
                as="button"
                onClick={() => void download(file)}
                // .CellSimple_separator - border-top, не border-bottom (см. DocumentListScreen).
                separator={index > 0}
                title={file.fileName}
                after={<span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{formatFileSize(file.size)}</span>}
              />
            ))}
          </CellList>
        </div>
      )}

      {doc.check?.summary && <AiSummary summary={doc.check.summary} />}

      {doc.check && (
        <CheckSummary
          status={doc.check.status}
          issueCount={doc.check.issues.length}
          manualCount={doc.check.fields.filter((field) => field.source === 'MANUAL' && field.fileValue != null).length}
          onOpen={() => navigate(documentCheckPath(doc.id))}
        />
      )}

      <HistoryAndVersions doc={doc} />
      </CenteredColumn>

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

      {doc.permissions.canWithdraw && activeSteps.length === 0 && (
        <BottomActionBar>
          <Button stretched variant="secondary" onClick={() => setWithdrawOpen(true)}>
            Отозвать с согласования
          </Button>
        </BottomActionBar>
      )}

      {doc.status === 'DRAFT' && doc.permissions.canSubmit && (
        <BottomActionBar>
          <Button stretched variant="primary" onClick={() => navigate(routePreviewPath(doc.id))}>
            К маршруту
          </Button>
        </BottomActionBar>
      )}

      {/* canSubmit = false на черновике - из-за BLOCKER в проверке (экран 10). Без этой
          кнопки открытый из списка черновик оставался тупиком: карточка вообще без кнопок,
          а счётчик замечаний раньше не был кликабелен (#71, ревью). */}
      {doc.status === 'DRAFT' && !doc.permissions.canSubmit && doc.check && (
        <BottomActionBar>
          <Button stretched variant="primary" onClick={() => navigate(documentCheckPath(doc.id))}>
            Исправить замечания
          </Button>
        </BottomActionBar>
      )}

      {/* Исправление — на экране проверки: там замечания, «Изменить» и «Заменить файл» (приёмка 24.09, п. 9).
          Раньше отсюда вела «Загрузить исправленную версию», хотя чаще нужно поправить поле, а не файл. */}
      {doc.status === 'RETURNED' && doc.permissions.canUploadVersion && (
        <BottomActionBar>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button stretched variant="primary" disabled={resendBusy} onClick={() => navigate(documentCheckPath(doc.id))}>
              {formContent ? 'Исправить записку' : 'Исправить документ'}
            </Button>
            <Button stretched variant="secondary" loading={resendBusy} disabled={resendBusy} onClick={() => void resendUnchanged()}>
              Отправить заново без изменений
            </Button>
          </div>
        </BottomActionBar>
      )}

      {toast && <Toast message={toast} onDismiss={dismissToast} />}

      <BottomSheet
        open={decisionDialog !== null && !rejectStep2}
        onClose={closeDialog}
        dismissible={!decisionBusy}
        title={decisionDialog?.action === 'RETURN' ? 'Вернуть на доработку' : 'Отклонить документ'}
      >
        <Typography.Text>Комментарий</Typography.Text>
        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Опишите, что нужно исправить"
        />
        <Typography.Text>Комментарий обязателен — без него отправить нельзя</Typography.Text>
        {decisionError && <ErrorText>{decisionError}</ErrorText>}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Button stretched variant="secondary" disabled={decisionBusy} onClick={closeDialog}>
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
        open={withdrawOpen}
        onClose={() => {
          setWithdrawOpen(false);
          setWithdrawError(null);
        }}
        title="Отозвать с согласования?"
        description="Согласование остановится, а тем, чья очередь уже подошла, придёт сообщение. Документ вернётся к вам."
        confirmLabel="Отозвать"
        busy={withdrawBusy}
        error={withdrawError}
        onConfirm={() => void withdraw()}
      />

      <ConfirmSheet
        open={decisionDialog !== null && rejectStep2}
        onClose={() => setRejectStep2(false)}
        title="Отклонение окончательное"
        description="Дальше пути для этого документа нет."
        confirmLabel="Отклонить"
        destructive
        busy={decisionBusy}
        onConfirm={() => {
          if (decisionDialog) {
            void submitDecision('REJECT', decisionDialog.stepId, comment.trim());
          }
        }}
      />
    </ScreenShell>
  );
}

const FILE_CHANGE_TEXT = { ADDED: 'добавлено', REMOVED: 'убрано', REPLACED: 'заменён' } as const;

/**
 * Что изменилось по сравнению с прошлой версией (приёмка 24.09, п. 1): после возврата документ снова проходит
 * всех, но согласующему не нужно перечитывать его целиком — достаточно посмотреть разницу.
 */
function ChangesSummary({ changes, isForm }: { changes: VersionChanges; isForm: boolean }) {
  const empty = changes.files.length === 0 && changes.fields.length === 0 && !changes.contentChanged;
  // У записки-формы (#59) содержимое — это и есть поля: «Изменён текст» повторял бы список полей ниже.
  const showContentChanged = changes.contentChanged && !(isForm && changes.fields.length > 0);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 12,
        borderRadius: 8,
        border: '1px solid var(--divider-primary)',
        background: 'var(--background-secondary)',
        fontSize: 14,
      }}
    >
      <strong>Изменения с версии {changes.comparedToVersionNo}</strong>
      {empty && <span style={{ color: 'var(--text-secondary)' }}>Документ не менялся.</span>}
      {showContentChanged && <span>Изменён текст документа</span>}
      {changes.files.map((file) => (
        <span key={`${file.change}:${file.fileName}`}>
          {file.kind === 'MAIN' ? 'Основной файл' : 'Приложение'} {FILE_CHANGE_TEXT[file.change]}: {file.fileName}
        </span>
      ))}
      {changes.fields.map((field) => (
        <span key={field.name} style={{ overflowWrap: 'anywhere' }}>
          {field.label}: <s style={{ color: 'var(--text-tertiary)' }}>{field.before ?? 'пусто'}</s> → {field.after ?? 'пусто'}
        </span>
      ))}
    </div>
  );
}

/**
 * Содержимое документа-формы (#59) — то, что согласующий читает вместо файла. Поля в порядке схемы
 * типа; пока подписи не загрузились — в порядке сохранения, с техническими именами.
 */
function FormContent({ content, definitions }: { content: Record<string, string>; definitions: DocumentTypeField[] }) {
  const rows = definitions.length > 0
    ? definitions.map((field) => ({ name: field.name, label: field.label, value: content[field.name] ?? '' }))
    : Object.entries(content).map(([name, value]) => ({ name, label: name, value }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Typography.Text>Содержание</Typography.Text>
      <dl
        style={{
          margin: 0,
          padding: '4px 12px',
          borderRadius: 8,
          border: '1px solid var(--divider-primary)',
          background: 'var(--background-secondary)',
        }}
      >
        {rows.map((row, index) => (
          <div key={row.name} style={{ padding: '8px 0', borderTop: index > 0 ? '1px solid var(--divider-primary)' : undefined }}>
            <dt style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{row.label}</dt>
            <dd
              style={{
                margin: '3px 0 0',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                color: row.value.trim() ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              {row.value.trim() || 'Не заполнено'}
            </dd>
          </div>
        ))}
      </dl>
      <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Заполнено в приложении, без файла</span>
    </div>
  );
}

/** Сводка модели для согласующего (#92): только если каждое число и дата из неё есть в тексте документа. */
function AiSummary({ summary }: { summary: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        borderRadius: 8,
        background: 'var(--background-secondary)',
      }}
    >
      <Typography.Text>Кратко от ИИ</Typography.Text>
      <span style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.4 }}>{summary}</span>
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
        Составлено ИИ по тексту документа. Решение принимаете вы
      </span>
    </div>
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
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Этап {stage.stageOrder}
        {parallel ? ' — согласуют параллельно' : ''}
      </span>
      {stage.steps.map((step) => (
        <div key={step.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>
            {step.role.name} — {step.approver.fullName}
            {/* Маршрут может только расти относительно шаблона (CLAUDE.md) - добавленные
                автором согласующие обязаны быть видны всем в цепочке, не только автору. */}
            {step.origin === 'ADDED_BY_AUTHOR' && (
              <span style={{ color: 'var(--text-tertiary)' }}> · добавлен автором</span>
            )}
          </span>
          <StepDecisionBadge decision={step.decision} autoReason={step.autoReason} />
        </div>
      ))}
    </div>
  );
}

// Свёрнуто, со счётчиком - сам список замечаний остаётся на экране 10 (#55), сюда его
// текст переносить не нужно. Нажатие ведёт туда же (documentCheckPath) - без этого
// черновик с замечаниями был тупиком: счётчик виден, а открыть список неоткуда (#71, ревью).
// CellSimple, не самописная кнопка - тот же компонент, что уже даёт строки файлов
// в этом экране (CLAUDE.md: "Компоненты @maxhub/max-ui предпочитать самописным").
function CheckSummary({
  status,
  issueCount,
  manualCount,
  onOpen,
}: {
  status: 'CHECKED' | 'FAILED';
  issueCount: number;
  /** Поля, которые автор изменил вручную, не меняя файл, — согласующий должен это видеть (#86). */
  manualCount: number;
  onOpen: () => void;
}) {
  // status = FAILED значит "проверка не выполнилась", а не "прошла и ничего не нашла" -
  // issues тогда пуст не потому что всё в порядке, а потому что её не было. Показывать
  // "нет" в этом случае значило бы соврать про состояние документа. У CellSimple нет
  // варианта с цветным фоном строки - предупреждение выражено цветом заголовка.
  return (
    <CellList mode="full-width">
      <CellSimple
        as="button"
        onClick={onOpen}
        showChevron
        subtitle={
          manualCount > 0 ? (
            <span style={{ color: 'var(--status-warning-fg)' }}>
              Полей, указанных вручную: {manualCount} — в самом файле этого нет или написано иначе
            </span>
          ) : (
            'Данные документа и замечания'
          )
        }
        title={
          status === 'FAILED' ? (
            <span style={{ color: 'var(--status-warning-fg)' }}>Проверка не выполнена</span>
          ) : (
            'Замечания проверки'
          )
        }
        after={
          status === 'CHECKED' && (
            <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{issueCount === 0 ? 'нет' : issueCount}</span>
          )
        }
      />
    </CellList>
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
