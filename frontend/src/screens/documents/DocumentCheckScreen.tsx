import { Button, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { changeDocumentType, correctFile, getDocument, getDocumentTypes, updateDocumentFields } from '../../api/documents';
import { GENERIC_ERROR_MESSAGE, errorMessage } from '../../api/errors';
import type {
  CheckField,
  CheckResult,
  DocumentCard,
  DocumentType,
  DocumentTypeField,
  RuleKind,
  Severity,
  ValidationIssue,
} from '../../api/types';
import { BottomSheet } from '../../components/base/BottomSheet';
import { ErrorState } from '../../components/base/StateCard';
import { documentCardPath, documentNewVersionPath, routePreviewPath } from '../../routes/paths';
import {
  DocumentScreen,
  FieldInputs,
  LoadingState,
  Notice,
  inputStyle,
  linkStyle,
  sectionStyle,
  stackStyle,
} from './DocumentFormParts';

const SEVERITY_LABELS: Record<Severity, string> = {
  BLOCKER: 'Критично',
  WARNING: 'Предупреждение',
  INFO: 'Подсказка',
};

const KIND_LABELS: Record<RuleKind, string> = {
  LEGAL: 'Закон',
  INTERNAL_POLICY: 'Регламент компании',
  PRODUCT_RULE: 'Правило продукта',
};

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function documentIdFrom(value: string | undefined): number | null {
  const result = Number(value);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

function fieldsToRecord(check: CheckResult | null): Record<string, string> {
  return Object.fromEntries(check?.fields.map((field) => [field.name, field.value ?? '']) ?? []);
}

function fieldDefinitions(type: DocumentType | undefined, check: CheckResult | null): DocumentTypeField[] {
  if (type) return type.fields;
  return check?.fields.map((field) => ({ name: field.name, type: 'STRING', label: field.name, hint: '' })) ?? [];
}

function severityColor(severity: Severity): string {
  if (severity === 'BLOCKER') return 'var(--status-danger-bg)';
  if (severity === 'WARNING') return 'var(--status-warning-bg)';
  return 'var(--status-neutral-bg)';
}

function severityTextColor(severity: Severity): string {
  if (severity === 'BLOCKER') return 'var(--status-danger-fg)';
  if (severity === 'WARNING') return 'var(--status-warning-fg)';
  return 'var(--status-neutral-fg)';
}

const SEVERITY_ORDER: Record<Severity, number> = { BLOCKER: 0, WARNING: 1, INFO: 2 };

/** Сначала то, что мешает отправке, потом предупреждения и подсказки. */
function sortIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return [...issues].sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]);
}

/** Откуда значение поля — чтобы было видно, где поработал ИИ, а где человек. */
function fieldOrigin(field: CheckField, modelAvailable: boolean): string | null {
  if (field.source === 'MANUAL' && field.fileValue) {
    return `Изменено вручную, файл не менялся. В файле: «${field.fileValue}»`;
  }
  if (field.source === 'MANUAL') {
    return modelAvailable ? 'Введено вручную' : null;
  }
  if (!field.value) {
    return 'ИИ не нашёл это поле в документе';
  }
  if (field.quote && field.quote !== field.value) {
    return `Нашёл ИИ в тексте: «${field.quote}»${field.page ? `, стр. ${field.page}` : ''}`;
  }
  return field.page ? `Нашёл ИИ в тексте, стр. ${field.page}` : 'Нашёл ИИ в тексте';
}

type CorrectionNotice = { versionNo: number; notApplied: { label: string; message: string }[] };

/** 10. Результат проверки (docs/SCREENS.md). */
export function DocumentCheckScreen() {
  const navigate = useNavigate();
  const documentId = documentIdFrom(useParams().id);
  const [card, setCard] = useState<DocumentCard | null>(null);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'file' | 'fields' | 'type' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [correction, setCorrection] = useState<CorrectionNotice | null>(null);
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const [nextTypeId, setNextTypeId] = useState<number | null>(null);
  const fieldsRef = useRef<HTMLElement>(null);
  const [scrollToFields, setScrollToFields] = useState(false);

  const load = useCallback(async () => {
    if (documentId === null) {
      setError('Документ не найден');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextCard, nextTypes] = await Promise.all([getDocument(documentId), getDocumentTypes()]);
      setCard(nextCard);
      setTypes(nextTypes);
      setFields(fieldsToRecord(nextCard.check));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Прокрутка к форме — после того, как она отрисована: до этого высота раздела ещё прежняя.
  useEffect(() => {
    if (scrollToFields && editing) {
      fieldsRef.current?.scrollIntoView({ block: 'start' });
      setScrollToFields(false);
    }
  }, [scrollToFields, editing]);

  const type = useMemo(() => types.find((item) => item.id === card?.type.id), [types, card?.type.id]);
  const definitions = useMemo(() => fieldDefinitions(type, card?.check ?? null), [card?.check, type]);
  const labels = useMemo(() => new Map(definitions.map((field) => [field.name, field.label])), [definitions]);

  function startEditing() {
    setActionError(null);
    setEditing(true);
    setScrollToFields(true);
  }

  function cancelEditing() {
    setFields(fieldsToRecord(card?.check ?? null));
    setActionError(null);
    setEditing(false);
  }

  /** Только изменённые поля: неизменённые остаются такими, как их нашёл ИИ, с цитатой. */
  function changedFields(): Record<string, string> {
    const original = fieldsToRecord(card?.check ?? null);
    return Object.fromEntries(Object.entries(fields).filter(([name, value]) => (original[name] ?? '') !== value));
  }

  async function writeIntoFile() {
    if (!card) return;
    const changed = changedFields();
    if (Object.keys(changed).length === 0) {
      setActionError('Вы ничего не изменили');
      return;
    }
    setBusy('file');
    setActionError(null);
    try {
      const result = await correctFile(card.id, card.currentVersionNo, changed);
      setCard(result.card);
      setFields(fieldsToRecord(result.card.check));
      setCorrection({
        versionNo: result.card.currentVersionNo,
        notApplied: result.notApplied.map((item) => ({ label: labels.get(item.field) ?? item.field, message: item.message })),
      });
      setEditing(false);
      window.scrollTo({ top: 0 });
    } catch (correctionError) {
      setActionError(errorMessage(correctionError));
    } finally {
      setBusy(null);
    }
  }

  async function saveFieldsOnly() {
    if (!card) return;
    setBusy('fields');
    setActionError(null);
    try {
      await updateDocumentFields(card.id, card.currentVersionNo, fields);
      const refreshed = await getDocument(card.id);
      setCard(refreshed);
      setFields(fieldsToRecord(refreshed.check));
      setCorrection(null);
      setEditing(false);
    } catch (saveError) {
      setActionError(errorMessage(saveError));
    } finally {
      setBusy(null);
    }
  }

  async function applyType() {
    if (!card || nextTypeId === null || nextTypeId === card.type.id) {
      setTypeSheetOpen(false);
      return;
    }
    setBusy('type');
    setActionError(null);
    try {
      const updated = await changeDocumentType(card.id, card.currentVersionNo, nextTypeId);
      setCard(updated);
      setFields(fieldsToRecord(updated.check));
      setCorrection(null);
      setEditing(false);
      setTypeSheetOpen(false);
    } catch (typeError) {
      setActionError(errorMessage(typeError));
      setTypeSheetOpen(false);
    } finally {
      setBusy(null);
    }
  }

  function saveDraft() {
    if (!card) return;
    navigate(documentCardPath(card.id), { state: { toast: 'Черновик сохранён — он в разделе «Мои»' } });
  }

  const back = documentId === null ? undefined : { to: documentCardPath(documentId), label: 'К документу' };
  if (loading) return <LoadingState />;
  if (error || !card) {
    return (
      <DocumentScreen back={back} title="Результат проверки">
        <ErrorState message={error ?? GENERIC_ERROR_MESSAGE} onRetry={() => void load()} />
      </DocumentScreen>
    );
  }

  const check = card.check;
  const hasBlocker = check?.issues.some((issue) => issue.severity === 'BLOCKER') ?? false;
  const mustFix = check?.status === 'FAILED' || hasBlocker;
  const isDraft = card.status === 'DRAFT';
  const isReturned = card.status === 'RETURNED';
  const currentVersion = card.versions.find((version) => version.versionNo === card.currentVersionNo);
  const mainFile = currentVersion?.files.find((file) => file.kind === 'MAIN');
  const sensitive = currentVersion?.containsSensitive ?? false;
  const canEdit = card.permissions.canEditFields || card.permissions.canCorrectFile;
  const isPdf = Boolean(mainFile && mainFile.mimeType !== DOCX);
  const modelAvailable = check?.modelAvailable ?? false;
  const manualCount = check?.fields.filter((field) => field.source === 'MANUAL' && field.fileValue).length ?? 0;
  // Сменить тип можно у своего черновика: тем же правом, что и правка полей.
  const canChangeType = isDraft && card.permissions.canEditFields;

  const footer = editing ? null : isDraft && card.permissions.canSubmit ? (
    <div style={{ ...stackStyle, gap: 8 }}>
      <Button stretched variant="primary" size="large" onClick={() => navigate(routePreviewPath(card.id))}>К маршруту</Button>
      <Button stretched variant="secondary" size="large" onClick={saveDraft}>Сохранить черновик</Button>
    </div>
  ) : isDraft && canEdit ? (
    <div style={{ ...stackStyle, gap: 8 }}>
      <Button stretched variant="primary" size="large" onClick={startEditing}>Исправить замечания</Button>
      <div style={{ display: 'flex', gap: 8 }}>
        {card.permissions.canUploadVersion && (
          <div style={{ flex: 1 }}>
            <Button stretched variant="secondary" onClick={() => navigate(documentNewVersionPath(card.id))}>Другой файл</Button>
          </div>
        )}
        <div style={{ flex: 1 }}>
          <Button stretched variant="secondary" onClick={saveDraft}>Сохранить черновик</Button>
        </div>
      </div>
    </div>
  ) : isReturned && card.permissions.canUploadVersion ? (
    <div style={{ ...stackStyle, gap: 8 }}>
      {card.permissions.canCorrectFile && (
        <Button stretched variant="primary" size="large" onClick={startEditing}>Исправить документ</Button>
      )}
      <Button
        stretched
        variant={card.permissions.canCorrectFile ? 'secondary' : 'primary'}
        size="large"
        onClick={() => navigate(documentNewVersionPath(card.id))}
      >
        Загрузить исправленный файл
      </Button>
    </div>
  ) : null;

  return (
    <DocumentScreen back={back} title={card.title} footer={footer}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: -8 }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          {card.type.name}
          {card.type.autoDetected ? ' · вид определил ИИ' : ''} · версия {card.currentVersionNo}
        </span>
        {canChangeType && (
          <Button
            size="small"
            variant="secondary"
            onClick={() => {
              setNextTypeId(card.type.id);
              setTypeSheetOpen(true);
            }}
          >
            Сменить тип
          </Button>
        )}
      </div>

      {correction && (
        <Notice tone="success">
          Исправления вписаны в файл — это версия {correction.versionNo}, и она проверена заново. Скачать её можно на карточке документа.
          {correction.notApplied.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {correction.notApplied.map((item) => (
                <li key={item.label}>
                  «{item.label}»: {item.message}
                </li>
              ))}
            </ul>
          )}
        </Notice>
      )}

      <HowChecked modelAvailable={modelAvailable} sensitive={sensitive} />

      {check?.status === 'FAILED' && <Notice tone="danger">Проверка не выполнена. Исправьте поля или загрузите файл ещё раз.</Notice>}
      {mustFix && check?.status !== 'FAILED' && (
        <Notice tone="danger">Отправка недоступна, пока есть критичные замечания. Предупреждения и подсказки отправке не мешают.</Notice>
      )}
      {manualCount > 0 && !editing && (
        <Notice>
          Полей, изменённых вручную без правки файла: {manualCount}. Согласующие увидят и новое значение, и то, что написано в файле.
        </Notice>
      )}
      {actionError && !editing && <Notice tone="danger">{actionError}</Notice>}

      <section style={sectionStyle}>
        <Typography.Headline variant="medium">Замечания</Typography.Headline>
        {!check || check.issues.length === 0 ? (
          <Notice tone="success">Замечаний нет</Notice>
        ) : (
          <div style={{ ...stackStyle, gap: 12 }}>
            {sortIssues(check.issues).map((issue) => (
              <article
                key={`${issue.ruleId}:${issue.fieldName}`}
                style={{
                  ...stackStyle,
                  gap: 8,
                  padding: 12,
                  borderRadius: 8,
                  background: 'var(--background-primary)',
                  borderLeft: `3px solid ${severityTextColor(issue.severity)}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 999,
                      background: severityColor(issue.severity),
                      color: severityTextColor(issue.severity),
                      fontSize: 12,
                    }}
                  >
                    {SEVERITY_LABELS[issue.severity]}
                  </span>
                  <strong>{labels.get(issue.fieldName) ?? issue.fieldName}</strong>
                </div>
                <Typography.Text>{issue.message}</Typography.Text>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  <span>{KIND_LABELS[issue.kind]}: </span>
                  {issue.sourceUrl ? (
                    <a href={issue.sourceUrl} target="_blank" rel="noreferrer" style={linkStyle}>{issue.sourceTitle}</a>
                  ) : (
                    <span>{issue.sourceTitle}</span>
                  )}
                  {issue.sourceRef && <span> · {issue.sourceRef}</span>}
                </div>
                {issue.quote && (
                  <blockquote style={{ margin: 0, paddingLeft: 12, borderLeft: '3px solid var(--divider-primary)', color: 'var(--text-secondary)' }}>
                    «{issue.quote}»{issue.page !== null ? `, стр. ${issue.page}` : ''}
                  </blockquote>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section ref={fieldsRef} style={{ ...sectionStyle, scrollMarginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Typography.Headline variant="medium">{modelAvailable ? 'Что нашёл ИИ в документе' : 'Данные документа'}</Typography.Headline>
          {canEdit && !editing && <Button size="small" variant="secondary" onClick={startEditing}>Изменить</Button>}
        </div>

        {editing ? (
          <div style={stackStyle}>
            <Typography.Text style={{ color: 'var(--text-secondary)' }}>
              {card.permissions.canCorrectFile
                ? 'Исправьте значения — мы впишем их прямо в файл Word на место прежних, оформление сохранится. Получится новая версия, и она будет проверена заново.'
                : 'Исправьте значения, которые ИИ прочитал неверно.'}
            </Typography.Text>
            <FieldInputs
              definitions={definitions}
              values={fields}
              onChange={(name, value) => setFields((current) => ({ ...current, [name]: value }))}
            />
            {!card.permissions.canCorrectFile && isPdf && (
              <Notice>
                PDF нельзя исправить автоматически. Если ошибка в самом документе — исправьте исходный файл и загрузите
                его. «Сохранить» ниже — только если ИИ прочитал поле неверно, а в файле всё правильно.
              </Notice>
            )}
            {actionError && <Notice tone="danger">{actionError}</Notice>}
            <div style={{ ...stackStyle, gap: 8 }}>
              {card.permissions.canCorrectFile && (
                <Button stretched variant="primary" size="large" loading={busy === 'file'} disabled={busy !== null} onClick={() => void writeIntoFile()}>
                  Исправить в файле и проверить
                </Button>
              )}
              {card.permissions.canEditFields && (
                <>
                  <Button
                    stretched
                    variant={card.permissions.canCorrectFile ? 'secondary' : 'primary'}
                    size="large"
                    loading={busy === 'fields'}
                    disabled={busy !== null}
                    onClick={() => void saveFieldsOnly()}
                  >
                    {card.permissions.canCorrectFile ? 'Сохранить, не меняя файл' : 'Сохранить и проверить'}
                  </Button>
                  {card.permissions.canCorrectFile && (
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      Если ИИ прочитал поле неверно, а в файле всё правильно. Согласующие увидят, что поле изменено вручную.
                    </span>
                  )}
                </>
              )}
              {!card.permissions.canCorrectFile && card.permissions.canUploadVersion && (
                <Button stretched variant="secondary" size="large" disabled={busy !== null} onClick={() => navigate(documentNewVersionPath(card.id))}>
                  Загрузить исправленный файл
                </Button>
              )}
              <Button stretched variant="secondary" size="large" disabled={busy !== null} onClick={cancelEditing}>
                Отмена
              </Button>
            </div>
            {busy === 'file' && <Notice>Вписываем исправления в файл и проверяем новую версию — ИИ читает её заново, это до минуты.</Notice>}
          </div>
        ) : check?.fields.length ? (
          <dl style={{ margin: 0 }}>
            {check.fields.map((field, index) => {
              const origin = fieldOrigin(field, modelAvailable);
              return (
                <div key={field.name} style={{ padding: '10px 0', borderTop: index > 0 ? '1px solid var(--divider-primary)' : undefined }}>
                  <dt style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{labels.get(field.name) ?? field.name}</dt>
                  <dd style={{ margin: '3px 0 0', overflowWrap: 'anywhere', color: field.value ? undefined : 'var(--text-tertiary)' }}>
                    {field.value || 'Не заполнено'}
                  </dd>
                  {origin && (
                    <dd style={{ margin: '3px 0 0', fontSize: 12, overflowWrap: 'anywhere', color: field.fileValue ? 'var(--status-warning-fg)' : 'var(--text-tertiary)' }}>
                      {origin}
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>
        ) : (
          <Typography.Text>Данных для отображения нет.</Typography.Text>
        )}
      </section>

      <BottomSheet open={typeSheetOpen} onClose={() => setTypeSheetOpen(false)} title="Тип документа">
        <Typography.Text style={{ color: 'var(--text-secondary)' }}>
          От типа зависят поля, правила проверки и маршрут согласования. Документ будет проверен заново.
        </Typography.Text>
        <select
          style={inputStyle}
          value={nextTypeId ?? ''}
          onChange={(event) => setNextTypeId(Number(event.target.value))}
        >
          {types.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <Button stretched variant="primary" loading={busy === 'type'} disabled={busy !== null} onClick={() => void applyType()}>
          Проверить по этому типу
        </Button>
      </BottomSheet>
    </DocumentScreen>
  );
}

/** Коротко: что сделал ИИ, что правила и кто решает (тест 23.09: «непонятно, как тут участвует GigaChat»). */
function HowChecked({ modelAvailable, sensitive }: { modelAvailable: boolean; sensitive: boolean }) {
  const text = modelAvailable
    ? 'ИИ (GigaChat) прочитал текст документа и нашёл в нём поля — у каждого видно, откуда оно взято. Затем правила компании и закона проверили эти поля: у каждого замечания есть источник. ИИ ничего не решает — решение принимают согласующие.'
    : sensitive
      ? 'Документ с чувствительными данными: текст не отправлялся в ИИ. Поля заполнены вручную, правила проверили их так же.'
      : 'ИИ сейчас недоступен, поэтому поля не заполнились сами. Заполните их вручную — правила проверят так же.';
  return (
    <details style={{ ...sectionStyle, gap: 8, padding: '12px 16px' }} open={!modelAvailable}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Как проверялся документ</summary>
      <Typography.Text style={{ color: 'var(--text-secondary)' }}>{text}</Typography.Text>
    </details>
  );
}
