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

  /** Изменённые относительно показанных значений: пустое и непустое не путаем с «ничего не меняли» (п. 6). */
  function changedFromShown(): Record<string, string> {
    const shown = fieldsToRecord(card?.check ?? null);
    return Object.fromEntries(Object.entries(fields).filter(([name, value]) => (shown[name] ?? '').trim() !== value.trim()));
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
    const changed = Object.entries(fields).filter(([name, value]) => (inFile[name] ?? '').trim() !== value.trim());
    if (changed.length === 0) {
      setActionError('В файле уже такие значения — исправлять нечего');
      return;
    }
    const emptied = changed.filter(([, value]) => !value.trim()).map(([name]) => `«${labelOf(name)}»`);
    if (emptied.length > 0) {
      setActionError(`Пустое значение в файл не вписываем: ${emptied.join(', ')}. Удалить текст можно только в самом документе.`);
      return;
    }
    const missing = changed.filter(([name]) => !(inFile[name] ?? '').trim());
    const writable = changed.filter(([name]) => (inFile[name] ?? '').trim());
    setBusy('file');
    setActionError(null);
    try {
      let target = card;
      let notApplied: CorrectionNotice['notApplied'] = [];
      let versionNo: number | null = null;
      if (writable.length > 0) {
        const result = await correctFile(card.id, card.currentVersionNo, Object.fromEntries(writable));
        target = result.card;
        versionNo = target.currentVersionNo;
        notApplied = result.notApplied.map((item) => ({ field: item.field, label: labelOf(item.field), message: item.message }));
      }
      if (missing.length > 0) {
        if (!target.permissions.canEditFields) {
          // Возвращённый документ: поля правятся у новой версии — с теми же файлами.
          const current = target.versions.find((version) => version.versionNo === target.currentVersionNo);
          target = await createDocumentVersion(target.id, {
            containsSensitive: current?.containsSensitive ?? false,
            keepFileIds: current?.files.map((file) => file.id) ?? [],
          });
          versionNo = target.currentVersionNo;
        }
        await updateDocumentFields(target.id, target.currentVersionNo, Object.fromEntries(missing));
        target = await getDocument(target.id);
      }
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
      await updateDocumentFields(card.id, card.currentVersionNo, changed);
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
      </div>

      {correction && (
        <Notice tone={correction.checked ? 'success' : 'danger'}>
          {correction.versionNo !== null
            ? correction.checked
              ? `Исправления вписаны в файл — это версия ${correction.versionNo}, она проверена заново. Скачать её можно на карточке документа.`
              : `Исправления вписаны в файл — это версия ${correction.versionNo}, но проверить её не удалось. Проверьте поля ниже или загрузите файл ещё раз.`
            : 'Данные документа сохранены и проверены заново.'}
          {correction.savedWithoutFile.length > 0 && (
            <div style={{ marginTop: 8 }}>
              В файле этого нет, поэтому значение сохранено в данных документа: {correction.savedWithoutFile.map((label) => `«${label}»`).join(', ')}.
              Согласующие увидят, что в самом файле этого нет.
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
        canEdit={card.permissions.canEditFields}
      />

      {check?.status === 'FAILED' && <Notice tone="danger">Проверка не выполнена. Исправьте поля или загрузите файл ещё раз.</Notice>}
      {mustFix && check?.status !== 'FAILED' && (
        <Notice tone="danger">Отправка недоступна, пока есть критичные замечания. Предупреждения и подсказки отправке не мешают.</Notice>
      )}
      {manualCount > 0 && !editing && (
        <Notice>
          Полей, указанных вручную без правки файла: {manualCount}. Согласующие увидят и значение, и то, что написано в самом файле.
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
              <Button size="small" variant="secondary" onClick={startEditing}>Изменить</Button>
            </div>
          )}
        </div>

        {editing ? (
          <div style={stackStyle}>
            <Typography.Text style={{ color: 'var(--text-secondary)' }}>
              {card.permissions.canCorrectFile
                ? 'Исправьте значения — они будут вписаны прямо в файл Word на место прежних, оформление сохранится. Получится новая версия, и она будет проверена заново.'
                : 'Исправьте значения, которые распознаны неверно.'}
            </Typography.Text>
            <FieldInputs
              typeCode={type?.code}
              definitions={definitions}
              values={fields}
              onChange={(name, value) => setFields((current) => ({ ...current, [name]: value }))}
            />
            {card.permissions.canCorrectFile && missingInFile.length > 0 && (
              <Notice>
                В файле нет {missingInFile.map((label) => `«${label}»`).join(', ')} — вписать некуда. Значение сохранится
                в данных документа, согласующие увидят, что в самом файле этого нет. Чтобы оно было и в файле, допишите
                его в документ и загрузите исправленный файл.
              </Notice>
            )}
            {!card.permissions.canCorrectFile && isPdf && (
              <Notice>
                PDF нельзя исправить автоматически. Если ошибка в самом документе — исправьте исходный файл и загрузите
                его. «Сохранить» ниже — если поле распознано неверно, а в файле всё правильно.
              </Notice>
            )}
            {actionError && <Notice tone="danger">{actionError}</Notice>}
            <div style={{ ...stackStyle, gap: 8 }}>
              {card.permissions.canCorrectFile && (
                <Button stretched variant="primary" size="large" loading={busy === 'file'} disabled={busy !== null} onClick={() => void writeIntoFile()}>
                  Исправить и проверить
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
                      Если поле распознано неверно, а в файле всё правильно. Файл не изменится, согласующие увидят ручную правку.
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
            {busy === 'file' && <Notice>Вписываем исправления в файл и проверяем новую версию — это до минуты.</Notice>}
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

      <BottomSheet
        open={typeSheetOpen}
        onClose={() => setTypeSheetOpen(false)}
        title="Тип документа"
        dismissible={busy !== 'type'}
      >
        <Typography.Text style={{ color: 'var(--text-secondary)' }}>
          От типа зависят поля, правила проверки и маршрут согласования. Документ будет проверен заново.
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
  // Кнопка «Изменить» есть только у черновика; у возвращённого документа поля правятся после новой версии.
  const fill = canEdit
    ? 'Заполните их кнопкой «Изменить»'
    : 'Нажмите «Загрузить исправленный файл» — можно и без нового файла, тогда поля станут доступны для правки';
  const text = textMissing
    ? `В файле нет текста — похоже, это скан или фотография. Распознаётся только текст, поэтому поля не заполнились сами. ${fill} или загрузите DOCX или PDF с текстом — правила проверят так же.`
    : modelAvailable
    ? 'Реквизиты документа распознаны автоматически: языковая модель прочитала текст и нашла адресата, дату, подпись и другие поля — у каждого видно, откуда оно взято. Затем правила проверили эти поля; у каждого замечания указано основание. Модель ничего не решает: решение принимают согласующие.'
    : sensitive
      ? 'Документ с чувствительными данными: текст не отправлялся на автоматическое распознавание. Поля заполнены вручную, правила проверили их так же.'
      : `Автоматическое распознавание сейчас недоступно, поэтому поля не заполнились сами. ${fill} — правила проверят так же.`;
  return (
    <details style={{ ...sectionStyle, gap: 8, padding: '12px 16px' }} open={!modelAvailable}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Как проверялся документ</summary>
      <Typography.Text style={{ color: 'var(--text-secondary)' }}>{text}</Typography.Text>
    </details>
  );
}
