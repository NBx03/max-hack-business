import { Button, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDocument, getDocumentTypes, updateDocumentFields } from '../../api/documents';
import { errorMessage } from '../../api/errors';
import type { CheckResult, DocumentCard, DocumentType, DocumentTypeField, RuleKind, Severity } from '../../api/types';
import { ErrorState } from '../../components/base/StateCard';
import { documentCardPath, documentNewVersionPath, routePreviewPath } from '../../routes/paths';
import {
  DocumentScreen,
  FieldInputs,
  LoadingState,
  Notice,
  SubmitButton,
  linkStyle,
  sectionStyle,
  stackStyle,
} from './DocumentFormParts';

const SEVERITY_LABELS: Record<Severity, string> = {
  BLOCKER: 'Критично',
  WARNING: 'Предупреждение',
  INFO: 'Информация',
};

const KIND_LABELS: Record<RuleKind, string> = {
  LEGAL: 'Закон',
  INTERNAL_POLICY: 'Регламент компании',
  PRODUCT_RULE: 'Правило продукта',
};

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

function severityAccentColor(severity: Severity): string {
  if (severity === 'BLOCKER') return 'var(--status-danger-fg)';
  if (severity === 'WARNING') return 'var(--status-warning-fg)';
  return 'var(--status-neutral-fg)';
}

export function DocumentCheckScreen() {
  const navigate = useNavigate();
  const documentId = documentIdFrom(useParams().id);
  const [card, setCard] = useState<DocumentCard | null>(null);
  const [type, setType] = useState<DocumentType>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Кнопка «Исправить поля» внизу открывает форму, которая выше по экрану, — прокручиваем к ней.
  const fieldsRef = useRef<HTMLElement>(null);
  const [scrollToFields, setScrollToFields] = useState(false);
  const startEditing = () => {
    setEditing(true);
    setScrollToFields(true);
  };
  // Прокрутка — после того, как форма отрисована: до этого высота раздела ещё прежняя.
  useEffect(() => {
    if (scrollToFields && editing) {
      fieldsRef.current?.scrollIntoView({ block: 'start' });
      setScrollToFields(false);
    }
  }, [scrollToFields, editing]);

  const load = useCallback(async () => {
    if (documentId === null) {
      setError('Документ не найден');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextCard, types] = await Promise.all([getDocument(documentId), getDocumentTypes()]);
      setCard(nextCard);
      setType(types.find((item) => item.id === nextCard.type.id));
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

  const definitions = useMemo(() => fieldDefinitions(type, card?.check ?? null), [card?.check, type]);
  const labels = useMemo(() => new Map(definitions.map((field) => [field.name, field.label])), [definitions]);
  const hasBlocker = card?.check?.issues.some((issue) => issue.severity === 'BLOCKER') ?? false;

  async function saveFields(event: FormEvent) {
    event.preventDefault();
    if (!card) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateDocumentFields(card.id, card.currentVersionNo, fields);
      const refreshed = await getDocument(card.id);
      setCard(refreshed);
      setFields(fieldsToRecord(refreshed.check));
      setEditing(false);
    } catch (saveFieldsError) {
      setSaveError(errorMessage(saveFieldsError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !card) {
    return <DocumentScreen title="Результат проверки"><ErrorState message={error ?? errorMessage(null)} onRetry={() => void load()} /></DocumentScreen>;
  }

  const check = card.check;
  const mustFix = check?.status === 'FAILED' || hasBlocker;

  // Нижняя панель — только кнопки: пояснение, почему нельзя отправить, стоит наверху, рядом
  // с замечаниями, а не перекрывает половину экрана. Пока открыта форма полей, у неё свои кнопки.
  const footer = editing ? null : mustFix ? (
    <div style={{ ...stackStyle, gap: 8 }}>
      {card.permissions.canEditFields && (
        <Button stretched variant="primary" size="large" onClick={startEditing}>Исправить поля</Button>
      )}
      {card.permissions.canUploadVersion && (
        <Button stretched variant="secondary" size="large" onClick={() => navigate(documentNewVersionPath(card.id))}>
          Загрузить исправленную версию
        </Button>
      )}
    </div>
  ) : card.status === 'RETURNED' && card.permissions.canUploadVersion ? (
    <Button stretched variant="primary" size="large" onClick={() => navigate(documentNewVersionPath(card.id))}>
      Загрузить исправленную версию
    </Button>
  ) : (
    <div style={{ ...stackStyle, gap: 8 }}>
      {card.permissions.canSubmit && (
        <Button stretched variant="primary" size="large" onClick={() => navigate(routePreviewPath(card.id))}>К маршруту</Button>
      )}
      <Button stretched variant="secondary" size="large" onClick={() => navigate(documentCardPath(card.id))}>
        Сохранить черновик
      </Button>
    </div>
  );

  return (
    <DocumentScreen title={card.title} footer={footer}>
      {!check?.modelAvailable && !card.type.isGeneric && (
        <Notice>Автоматический разбор недоступен. Проверьте поля и заполните недостающие вручную.</Notice>
      )}
      {check?.status === 'FAILED' && <Notice tone="danger">Проверка не выполнена. Сохраните поля ещё раз.</Notice>}
      {mustFix && check?.status !== 'FAILED' && (
        <Notice tone="danger">Отправка недоступна: исправьте критические замечания и повторите проверку.</Notice>
      )}

      <section style={sectionStyle}>
        <Typography.Headline variant="medium">Замечания</Typography.Headline>
        {!check || check.issues.length === 0 ? (
          <Notice tone="success">Замечаний нет</Notice>
        ) : (
          <div style={{ ...stackStyle, gap: 12 }}>
            {check.issues.map((issue) => (
              <article
                key={`${issue.ruleId}:${issue.fieldName}`}
                style={{
                  ...stackStyle,
                  gap: 8,
                  padding: 12,
                  borderRadius: 8,
                  background: 'var(--background-primary)',
                  borderLeft: `3px solid ${severityAccentColor(issue.severity)}`,
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
          <Typography.Headline variant="medium">Данные документа</Typography.Headline>
          {/* Второстепенное действие раздела — маленькая кнопка, а не вторая главная кнопка экрана. */}
          {card.permissions.canEditFields && !editing && (
            <Button size="small" variant="secondary" onClick={() => setEditing(true)}>Изменить</Button>
          )}
        </div>
        {editing ? (
          <form style={stackStyle} onSubmit={(event) => void saveFields(event)}>
            <FieldInputs
              definitions={definitions}
              values={fields}
              onChange={(name, value) => setFields((current) => ({ ...current, [name]: value }))}
            />
            {saveError && <Notice tone="danger">{saveError}</Notice>}
            <div style={{ ...stackStyle, gap: 8 }}>
              <SubmitButton busy={saving}>Сохранить и проверить</SubmitButton>
              <Button
                stretched
                type="button"
                variant="secondary"
                size="large"
                disabled={saving}
                onClick={() => {
                  setFields(fieldsToRecord(check));
                  setEditing(false);
                }}
              >
                Отмена
              </Button>
            </div>
          </form>
        ) : check?.fields.length ? (
          <dl style={{ margin: 0 }}>
            {check.fields.map((field, index) => (
              <div key={field.name} style={{ padding: '10px 0', borderTop: index > 0 ? '1px solid var(--divider-primary)' : undefined }}>
                <dt style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{labels.get(field.name) ?? field.name}</dt>
                <dd style={{ margin: '3px 0 0', overflowWrap: 'anywhere', color: field.value ? undefined : 'var(--text-tertiary)' }}>
                  {field.value || 'Не заполнено'}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <Typography.Text>Данных для отображения нет.</Typography.Text>
        )}
      </section>
    </DocumentScreen>
  );
}
