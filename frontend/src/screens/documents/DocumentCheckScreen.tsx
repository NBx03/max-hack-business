import { Button, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  changeDocumentType,
  correctFile,
  createDocumentVersion,
  getDocument,
  getDocumentTypes,
  updateDocumentFields,
} from '../../api/documents';
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
import { scrollScreenToTop } from '../../components/base/Layout';
import { ErrorState } from '../../components/base/StateCard';
import { documentCardPath, documentNewVersionPath, routePreviewPath } from '../../routes/paths';
import { applyCorrection, changedFields, keepingFilesInput, manualValues, sameValue } from './fieldCorrection';
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

/**
 * Подпись к источнику замечания. «Регламент компании» у правил со ссылкой на ГОСТ путал: ГОСТ — не
 * регламент самой компании (приёмка 24.09). Поэтому показываем основание, а вид — только у закона.
 */
const BASIS_LABELS: Record<RuleKind, string> = {
  LEGAL: 'Требование закона',
  INTERNAL_POLICY: 'Основание',
  PRODUCT_RULE: 'Рекомендация сервиса',
};

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function documentIdFrom(value: string | undefined): number | null {
  const result = Number(value);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

function fieldsToRecord(check: CheckResult | null): Record<string, string> {
  return Object.fromEntries(check?.fields.map((field) => [field.name, field.value ?? '']) ?? []);
}

/** Что сейчас написано в файле: после «Сохранить, не меняя файл» это fileValue, а не value (ревью #88). */
function fileValuesRecord(check: CheckResult | null): Record<string, string> {
  return Object.fromEntries(check?.fields.map((field) => [field.name, field.fileValue ?? field.value ?? '']) ?? []);
}

/** Как на экране загрузки: по алфавиту, «Другой документ» последним. */
function sortTypes(types: DocumentType[]): DocumentType[] {
  return [...types].sort((left, right) =>
    Number(left.code === 'GENERIC') - Number(right.code === 'GENERIC') || left.name.localeCompare(right.name, 'ru'));
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

/** Откуда значение поля: из текста документа (с цитатой) или указано вручную, и что тогда в файле. */
function fieldOrigin(field: CheckField, modelAvailable: boolean): string | null {
  if (field.source === 'MANUAL' && field.fileValue === '') {
    return 'Указано вручную — в файле этого нет';
  }
  if (field.source === 'MANUAL' && field.fileValue) {
    return `Изменено вручную, файл не менялся. В файле: «${field.fileValue}»`;
  }
  if (field.source === 'MANUAL') {
    return modelAvailable ? 'Указано вручную' : null;
  }
  if (!field.value) {
    return 'В документе не найдено';
  }
  if (field.quote && field.quote !== field.value) {
    return `Из текста документа: «${field.quote}»${field.page ? `, стр. ${field.page}` : ''}`;
  }
  return field.page ? `Из текста документа, стр. ${field.page}` : 'Из текста документа';
}

type CorrectionNotice = {
  /** Номер новой версии, если исправления вписаны в файл. */
  versionNo: number | null;
  checked: boolean;
  /** Поля, которых в файле нет: сохранены в данных документа, файл не менялся. */
  savedWithoutFile: string[];
  notApplied: { field: string; label: string; message: string }[];
};


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

  function labelOf(name: string): string {
    return labels.get(name) ?? name;
  }

  /** Изменённые относительно показанных значений (п. 6); пустое и незаполненное — одно и то же. */
  function changedFromShown(): Record<string, string> {
    return Object.fromEntries(changedFields(fields, fieldsToRecord(card?.check ?? null)));
  }

  /**
   * После ошибки перечитываем документ: часть шагов могла уже выполниться, и экран должен показывать
   * фактическую версию, иначе повтор ушёл бы со старым номером версии (ревью #95, п. 1).
   */
  async function resyncAfterError(documentId: number) {
    try {
      const fresh = await getDocument(documentId);
      setCard(fresh);
      return fresh;
    } catch {
      return null;
    }
  }

  /**
   * «Исправить и проверить» — одно действие без тупиков (приёмка 24.09, п. 8): что есть в файле,
   * вписывается в файл (новая версия), а поле, которого в файле нет вовсе (адресат), сохраняется
   * в данных документа с пометкой «в файле этого нет» — согласующий её увидит.
   */
  async function writeIntoFile() {
    if (!card) return;
    // Сравниваем с тем, что в файле, а не с показанным значением: после «Сохранить, не меняя файл»
    // поле уже содержит новое значение, и его всё равно можно вписать в файл (ревью #88).
    const inFile = fileValuesRecord(card.check);
    const changed = changedFields(fields, inFile);
    if (changed.length === 0) {
      setActionError('В файле уже такие значения — исправлять нечего');
      return;
    }
    const emptied = changed.filter(([, value]) => !value.trim()).map(([name]) => `«${labelOf(name)}»`);
    if (emptied.length > 0) {
      setActionError(`Пустое значение в файл не вписываем: ${emptied.join(', ')}. Удалить текст можно только в самом документе.`);
      return;
    }
    // Поле, которого в файле нет, — «изменено», только если отличается от уже сохранённого: иначе «Исправить и
    // проверить» без правок у возвращённого документа создавало бы пустую новую версию (ревью #96, п. 4).
    const shown = fieldsToRecord(card.check);
    const missing = changed.filter(([name, value]) => !(inFile[name] ?? '').trim() && !sameValue(shown[name], value));
    const writable = changed.filter(([name]) => (inFile[name] ?? '').trim());
    if (missing.length === 0 && writable.length === 0) {
      setActionError('Вы ничего не изменили — исправлять нечего');
      return;
    }
    setBusy('file');
    setActionError(null);
    try {
      const outcome = await applyCorrection(
        { correctFile, createDocumentVersion, updateDocumentFields, getDocument },
        card,
        Object.fromEntries(writable),
        Object.fromEntries(missing),
        setCard,
      );
      const target = outcome.card;
      const versionNo = outcome.versionNo;
      const notApplied = outcome.notApplied.map((item) => ({ field: item.field, label: labelOf(item.field), message: item.message }));
      setCard(target);
      // Невписанные значения не стираем: их можно сохранить без правки файла, не набирая заново.
      const kept = Object.fromEntries(notApplied.map((item) => [item.field, fields[item.field] ?? '']));
      setFields({ ...fieldsToRecord(target.check), ...kept });
      setCorrection({
        versionNo,
        checked: target.check?.status === 'CHECKED',
        savedWithoutFile: missing.map(([name]) => labelOf(name)),
        notApplied,
      });
      setEditing(notApplied.length > 0 && target.permissions.canEditFields);
      scrollScreenToTop();
    } catch (correctionError) {
      setActionError(errorMessage(correctionError));
      // Форму не сбрасываем: введённое остаётся, а номер версии берётся уже из свежей карточки.
      await resyncAfterError(card.id);
    } finally {
      setBusy(null);
    }
  }

  async function saveFieldsOnly() {
    if (!card) return;
    // Только изменённые поля: нетронутые остаются «из текста документа», а не «указано вручную» (п. 6).
    const changed = changedFromShown();
    if (Object.keys(changed).length === 0) {
      setEditing(false);
      return;
    }
    setBusy('fields');
    setActionError(null);
    try {
      // Возвращённая версия не меняется — она в истории. Поля правятся у новой версии с теми же файлами.
      let target = card;
      let payload = changed;
      if (!card.permissions.canEditFields) {
        target = await createDocumentVersion(card.id, keepingFilesInput(card));
        setCard(target);
        // Ручные значения — заново: бэкенд переносит поля сам, только если прошлая проверка прошла (ревью #96, п. 2).
        payload = { ...manualValues(card), ...changed };
      }
      await updateDocumentFields(target.id, target.currentVersionNo, payload);
      const refreshed = await getDocument(card.id);
      setCard(refreshed);
      setFields(fieldsToRecord(refreshed.check));
      setCorrection(null);
      setEditing(false);
    } catch (saveError) {
      setActionError(errorMessage(saveError));
      await resyncAfterError(card.id);
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
  // Возвращённый документ тоже правится здесь же, кнопкой «Изменить»: сохранение создаёт новую версию
  // (приёмка 24.09, п. 9 — раньше для этого нужно было «Загрузить исправленный файл» без файла).
  const canSaveFields = card.permissions.canEditFields || (isReturned && card.permissions.canUploadVersion);
  const canEdit = canSaveFields || card.permissions.canCorrectFile;
  const isPdf = Boolean(mainFile && mainFile.mimeType !== DOCX);
  const modelAvailable = check?.modelAvailable ?? false;
  const manualCount = check?.fields.filter((field) => field.source === 'MANUAL' && field.fileValue != null).length ?? 0;
  // Сменить тип можно у своего черновика: тем же правом, что и правка полей.
  // Поля, которых в файле нет, но в форме уже есть значение: вписать некуда, сохраним в данных документа.
  const inFileNow = fileValuesRecord(check ?? null);
  const missingInFile = editing
    ? Object.entries(fields)
        .filter(([name, value]) => value.trim() && !(inFileNow[name] ?? '').trim())
        .map(([name]) => labelOf(name))
    : [];
  // Пока идёт правка полей, смена типа стёрла бы введённое — кнопку прячем (ревью #88).
  const canChangeType = isDraft && card.permissions.canEditFields && !editing;

  // Каждое действие — в одном месте (приёмка 24.09, п. 7: «Исправить замечания» внизу и «Изменить» справа
  // делали одно и то же). Поля — «Изменить» у «Данных документа»; файл целиком — «Заменить файл» вверху, рядом
  // с типом, и у чистого черновика тоже; внизу — только куда дальше: к маршруту или сохранить черновик.
  // «Заменить файл», а не «Другой файл»: это новый файл этого же документа, а не другой документ (п. 8).
  const canReplaceFile = card.permissions.canUploadVersion && !editing;
  const footer = editing ? null : isDraft && card.permissions.canSubmit ? (
    <div style={{ ...stackStyle, gap: 8 }}>
      <Button stretched variant="primary" size="large" onClick={() => navigate(routePreviewPath(card.id))}>К маршруту</Button>
      <Button stretched variant="secondary" size="large" onClick={saveDraft}>Сохранить черновик</Button>
    </div>
  ) : isDraft && canEdit ? (
    <Button stretched variant="secondary" size="large" onClick={saveDraft}>Сохранить черновик</Button>
  ) : null;

  return (
    <DocumentScreen back={back} title={card.title} footer={footer}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: -8 }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          {card.type.name}
          {card.type.autoDetected ? ' · определён автоматически' : ''} · версия {card.currentVersionNo}
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
        {canReplaceFile && (
          <Button size="small" variant="secondary" onClick={() => navigate(documentNewVersionPath(card.id))}>
            Заменить файл
          </Button>
        )}
      </div>

      {correction && (
        <Notice tone={correction.checked ? 'success' : 'danger'}>
          {correction.versionNo !== null
            ? correction.checked
              ? `Исправлено в файле — версия ${correction.versionNo}, проверена заново.`
              : `Исправлено в файле — версия ${correction.versionNo}, но проверка не удалась. Проверьте поля или замените файл.`
            : 'Сохранено и проверено заново.'}
          {correction.savedWithoutFile.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {correction.savedWithoutFile.map((label) => `«${label}»`).join(', ')}: в файле этого нет — сохранено в данных
              документа, согласующие это увидят.
            </div>
          )}
          {correction.notApplied.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {correction.notApplied.map((item) => (
                <li key={item.field}>
                  «{item.label}»: {item.message}
                </li>
              ))}
            </ul>
          )}
        </Notice>
      )}

      <HowChecked
        modelAvailable={modelAvailable}
        sensitive={sensitive}
        textMissing={Boolean(check?.textMissing)}
        canEdit={canEdit}
      />

      {check?.status === 'FAILED' && <Notice tone="danger">Проверка не выполнена. Исправьте поля или загрузите файл ещё раз.</Notice>}
      {mustFix && check?.status !== 'FAILED' && (
        <Notice tone="danger">Есть критичные замечания — отправить пока нельзя. Исправьте поля кнопкой «Изменить» ниже или замените файл кнопкой вверху.</Notice>
      )}
      {manualCount > 0 && !editing && (
        <Notice>
          Указано вручную, без правки файла: {manualCount}. Согласующие это увидят.
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
                  <span>{BASIS_LABELS[issue.kind]}{issue.kind === 'PRODUCT_RULE' ? '' : ': '}</span>
                  {issue.kind === 'PRODUCT_RULE' ? null : issue.sourceUrl ? (
                    <a href={issue.sourceUrl} target="_blank" rel="noreferrer" style={linkStyle}>{issue.sourceTitle}</a>
                  ) : (
                    <span>{issue.sourceTitle}</span>
                  )}
                  {issue.kind !== 'PRODUCT_RULE' && issue.sourceRef && <span> · {issue.sourceRef}</span>}
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
          <Typography.Headline variant="medium">Данные документа</Typography.Headline>
          {canEdit && !editing && (
            <div style={{ flex: 'none', whiteSpace: 'nowrap' }}>
              <Button size="small" variant={mustFix || isReturned ? 'primary' : 'secondary'} onClick={startEditing}>Изменить</Button>
            </div>
          )}
        </div>

        {editing ? (
          <div style={stackStyle}>
            <Typography.Text style={{ color: 'var(--text-secondary)' }}>
              {card.permissions.canCorrectFile
                ? 'Новые значения впишем в файл Word на место прежних — получится новая версия.'
                : 'Исправьте значения, распознанные неверно.'}
            </Typography.Text>
            <FieldInputs
              typeCode={type?.code}
              definitions={definitions}
              values={fields}
              onChange={(name, value) => setFields((current) => ({ ...current, [name]: value }))}
            />
            {card.permissions.canCorrectFile && missingInFile.length > 0 && (
              <Notice>
                В файле нет {missingInFile.map((label) => `«${label}»`).join(', ')} — значение сохранится в данных документа.
              </Notice>
            )}
            {!card.permissions.canCorrectFile && isPdf && (
              <Notice>PDF не исправляется автоматически: ошибку в самом документе исправьте в исходнике и замените файл.</Notice>
            )}
            {actionError && <Notice tone="danger">{actionError}</Notice>}
            <div style={{ ...stackStyle, gap: 8 }}>
              {card.permissions.canCorrectFile && (
                <Button stretched variant="primary" size="large" loading={busy === 'file'} disabled={busy !== null} onClick={() => void writeIntoFile()}>
                  Исправить и проверить
                </Button>
              )}
              {canSaveFields && (
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
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      Если поле распознано неверно, а в файле всё верно.
                    </span>
                  )}
                </>
              )}
              {!card.permissions.canCorrectFile && card.permissions.canUploadVersion && (
                <Button stretched variant="secondary" size="large" disabled={busy !== null} onClick={() => navigate(documentNewVersionPath(card.id))}>
                  Заменить файл
                </Button>
              )}
              <Button stretched variant="secondary" size="large" disabled={busy !== null} onClick={cancelEditing}>
                Отмена
              </Button>
            </div>
            {busy === 'file' && <Notice>Вписываем исправления и проверяем — до минуты.</Notice>}
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
                    <dd style={{ margin: '3px 0 0', fontSize: 13, overflowWrap: 'anywhere', color: field.fileValue ? 'var(--status-warning-fg)' : 'var(--text-secondary)' }}>
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

      <BottomSheet
        open={typeSheetOpen}
        onClose={() => setTypeSheetOpen(false)}
        title="Тип документа"
        dismissible={busy !== 'type'}
      >
        <Typography.Text style={{ color: 'var(--text-secondary)' }}>
          От типа зависят поля, правила и маршрут. Документ проверится заново.
        </Typography.Text>
        <select
          style={inputStyle}
          value={nextTypeId ?? ''}
          onChange={(event) => setNextTypeId(Number(event.target.value))}
        >
          {sortTypes(types).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <Button stretched variant="primary" loading={busy === 'type'} disabled={busy !== null} onClick={() => void applyType()}>
          Проверить по этому типу
        </Button>
      </BottomSheet>
    </DocumentScreen>
  );
}

/** Коротко: что сделал ИИ, что правила и кто решает. Без названия модели: провайдер меняется настройкой. */
function HowChecked({
  modelAvailable,
  sensitive,
  textMissing,
  canEdit,
}: {
  modelAvailable: boolean;
  sensitive: boolean;
  textMissing: boolean;
  canEdit: boolean;
}) {
  const fill = canEdit ? 'Заполните поля кнопкой «Изменить»' : 'Поля заполняет автор';
  const text = textMissing
    ? `Похоже, это скан: в файле нет текста. ${fill} или загрузите файл с текстом.`
    : modelAvailable
    ? 'Реквизиты распознаны по тексту — у каждого поля видно, откуда оно. Замечания находят правила, решение принимают люди.'
    : sensitive
      ? 'Чувствительные данные: текст не распознавался автоматически, поля заполнены вручную.'
      : `Распознавание сейчас недоступно. ${fill} — правила проверят так же.`;
  return (
    <details style={{ ...sectionStyle, gap: 8, padding: '12px 16px' }} open={!modelAvailable}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Как проверялся документ</summary>
      <Typography.Text style={{ color: 'var(--text-secondary)' }}>{text}</Typography.Text>
    </details>
  );
}
