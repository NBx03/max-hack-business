import { Button, Input, Radio, Switch, Textarea, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { getCompanyRules, resetCompanyRule, updateCompanyRule } from '../../api/organization';
import type { CompanyRule, CompanyRules, RuleSettingInput, Severity } from '../../api/types';
import { BottomSheet } from '../../components/base/BottomSheet';
import { ErrorState } from '../../components/base/StateCard';
import { Toast } from '../../components/base/Toast';
import { ROUTE_PATTERNS } from '../../routes/paths';
import { DocumentScreen, LoadingState, Notice, inputStyle, stackStyle } from '../documents/DocumentFormParts';
import { KIND_LABELS, SEVERITY_HINTS, SEVERITY_LABELS, ruleBasis, ruleTitle } from './ruleText';

const SEVERITIES: Severity[] = ['BLOCKER', 'WARNING', 'INFO'];
const BACK = { to: ROUTE_PATTERNS.company, label: 'Компания' };

const chip = (background: string, color: string) => ({
  fontSize: 12,
  padding: '2px 8px',
  borderRadius: 999,
  background,
  color,
  whiteSpace: 'nowrap' as const,
});

function severityChip(severity: Severity) {
  if (severity === 'BLOCKER') return chip('var(--status-danger-bg)', 'var(--status-danger-fg)');
  if (severity === 'WARNING') return chip('var(--status-warning-bg)', 'var(--status-warning-fg)');
  return chip('var(--status-neutral-bg)', 'var(--status-neutral-fg)');
}

/**
 * «Компания» → «Правила проверки» (#91). Кто сюда приходит и зачем:
 * - автор или согласующий — понять, откуда замечание и на чём оно основано: всё видно без нажатий;
 * - администратор — подстроить типовые правила под документы своей компании: выключить лишнее, сменить
 *   важность, текст и основание, а у «Не короче» и «Одно из значений» — само значение;
 * - кто угодно — попробовать ослабить закон: у закона замок и объяснение, а не форма.
 * Новые правила и поля здесь не создаются — это данные шаблона сервиса. Изменения действуют для новых проверок:
 * документы на согласовании не пересчитываются, черновик автор перепроверяет кнопкой «Проверить заново».
 */
export function RulesScreen() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<CompanyRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [editing, setEditing] = useState<CompanyRule | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setData(await getCompanyRules());
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Ссылка «Настроить правило» с экрана проверки: сразу нужный вид документа и, у администратора, само правило.
  const linkedRuleId = Number(params.get('rule')) || null;
  useEffect(() => {
    if (!data) return;
    const linkedType = linkedRuleId === null
      ? null
      : data.types.find((type) => type.rules.some((rule) => rule.id === linkedRuleId));
    setTypeId((current) => linkedType?.documentTypeId ?? current ?? data.types[0]?.documentTypeId ?? null);
    if (linkedType && data.canEdit) {
      setEditing(linkedType.rules.find((rule) => rule.id === linkedRuleId) ?? null);
    }
    // Только при загрузке и по ссылке: дальше вид выбирает человек.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data === null, linkedRuleId]);

  const selected = useMemo(() => data?.types.find((type) => type.documentTypeId === typeId) ?? null, [data, typeId]);

  function closeEditor() {
    setEditing(null);
    if (params.has('rule')) {
      params.delete('rule');
      setParams(params, { replace: true });
    }
  }

  if (loading && !data) return <LoadingState />;
  if (loadError || !data) {
    return (
      <DocumentScreen title="Правила проверки" back={BACK} nav>
        <ErrorState message={loadError ?? 'Не удалось загрузить правила'} onRetry={() => void load()} />
      </DocumentScreen>
    );
  }

  const changedCount = data.types.reduce((sum, type) => sum + type.rules.filter((rule) => rule.customized).length, 0);

  return (
    <DocumentScreen title="Правила проверки" back={BACK} nav>
      <Typography.Text style={{ color: 'var(--text-secondary)', marginTop: -8 }}>
        {data.canEdit
          ? 'Типовые правила сервиса. Нажмите на правило, чтобы подстроить его под документы компании.'
          : 'По этим правилам проверяются документы компании. Менять их может администратор.'}
      </Typography.Text>
      {changedCount > 0 && (
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Изменено компанией: {changedCount}</span>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Вид документа</span>
        <select style={inputStyle} value={typeId ?? ''} onChange={(event) => setTypeId(Number(event.target.value))}>
          {data.types.map((type) => (
            <option key={type.documentTypeId} value={type.documentTypeId}>
              {type.name}
            </option>
          ))}
        </select>
      </label>

      <div style={{ ...stackStyle, gap: 10 }}>
        {selected?.rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            highlighted={rule.id === linkedRuleId}
            onOpen={data.canEdit ? () => setEditing(rule) : undefined}
          />
        ))}
      </div>

      <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
        Новые правила и поля добавляются в шаблон сервиса, а не здесь.
      </span>

      <RuleEditor
        rule={editing}
        onClose={closeEditor}
        onSaved={(next, message) => {
          setData(next);
          closeEditor();
          setToast(message);
        }}
      />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </DocumentScreen>
  );
}

function RuleCard({ rule, highlighted, onOpen }: { rule: CompanyRule; highlighted: boolean; onOpen?: () => void }) {
  const content = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <strong style={{ fontSize: 15, textDecoration: rule.enabled ? undefined : 'line-through' }}>{ruleTitle(rule)}</strong>
        <span style={rule.enabled ? severityChip(rule.severity) : chip('var(--status-neutral-bg)', 'var(--status-neutral-fg)')}>
          {rule.enabled ? SEVERITY_LABELS[rule.severity] : 'Не проверяется'}
        </span>
      </div>
      <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{rule.description}</span>
      <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{ruleBasis(rule, true)}</span>
      {(rule.customized || rule.locked) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {rule.locked && <span style={chip('var(--status-neutral-bg)', 'var(--status-neutral-fg)')}>🔒 Закон — не меняется</span>}
          {rule.customized && <span style={chip('var(--status-progress-bg)', 'var(--status-progress-fg)')}>Изменено компанией</span>}
        </div>
      )}
    </>
  );
  const style = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    width: '100%',
    textAlign: 'left' as const,
    padding: '12px 14px',
    borderRadius: 12,
    border: highlighted ? '1px solid var(--status-progress-fg)' : '1px solid var(--divider-primary)',
    background: 'var(--background-secondary)',
    color: 'var(--text-primary)',
    opacity: rule.enabled ? 1 : 0.7,
    font: 'inherit',
  };
  return onOpen ? (
    <button type="button" onClick={onOpen} style={{ ...style, cursor: 'pointer' }}>
      {content}
    </button>
  ) : (
    <div style={style}>{content}</div>
  );
}

type Draft = {
  enabled: boolean;
  severity: Severity;
  description: string;
  sourceTitle: string;
  sourceRef: string;
  minLength: string;
  allowedValues: string;
};

function draftOf(rule: CompanyRule): Draft {
  // У рекомендации сервиса своего документа-основания нет — поле пустое, пока компания не укажет свой.
  const ownOrTemplateSource = rule.kind === 'PRODUCT_RULE' ? '' : rule.sourceTitle;
  return {
    enabled: rule.enabled,
    severity: rule.severity,
    description: rule.description,
    sourceTitle: ownOrTemplateSource,
    sourceRef: rule.kind === 'PRODUCT_RULE' ? '' : rule.sourceRef ?? '',
    minLength: rule.minLength === null ? '' : String(rule.minLength),
    allowedValues: (rule.allowedValues ?? []).join('\n'),
  };
}

function RuleEditor({
  rule,
  onClose,
  onSaved,
}: {
  rule: CompanyRule | null;
  onClose: () => void;
  onSaved: (rules: CompanyRules, message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(rule ? draftOf(rule) : null);
    setError(null);
  }, [rule]);

  if (!rule || !draft) {
    return <BottomSheet open={false} onClose={onClose} title="">{null}</BottomSheet>;
  }

  const update = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  async function save() {
    if (!rule || !draft) return;
    const input: RuleSettingInput = {
      enabled: draft.enabled,
      severity: draft.severity,
      description: draft.description,
      sourceTitle: draft.sourceTitle.trim() || null,
      sourceRef: draft.sourceRef.trim() || null,
    };
    if (rule.check === 'MIN_LENGTH') {
      const value = Number(draft.minLength);
      if (!Number.isInteger(value) || value < 1) {
        setError('Минимальная длина — целое число больше нуля');
        return;
      }
      input.minLength = value;
    }
    if (rule.check === 'ONE_OF') {
      input.allowedValues = draft.allowedValues.split('\n').map((value) => value.trim()).filter(Boolean);
    }
    setBusy('save');
    setError(null);
    try {
      onSaved(await updateCompanyRule(rule.id, input), 'Правило сохранено. Действует для новых проверок');
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!rule) return;
    setBusy('reset');
    setError(null);
    try {
      onSaved(await resetCompanyRule(rule.id), 'Правило снова как в типовом шаблоне');
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setBusy(null);
    }
  }

  const labelStyle = { fontSize: 14, color: 'var(--text-secondary)' } as const;

  return (
    <BottomSheet open onClose={onClose} title={ruleTitle(rule)} dismissible={busy === null}>
      {rule.locked ? (
        <div style={{ ...stackStyle, gap: 10 }}>
          <Notice>🔒 Требование закона одинаково для всех компаний — выключить или ослабить его нельзя.</Notice>
          <span style={{ fontSize: 14 }}>{rule.description}</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{ruleBasis(rule)}</span>
          <Button stretched variant="secondary" onClick={onClose}>Понятно</Button>
        </div>
      ) : (
        <div style={{ ...stackStyle, gap: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Switch checked={draft.enabled} disabled={busy !== null} onChange={(event) => update({ enabled: event.target.checked })} />
            <span>Проверять это правило</span>
          </label>

          {draft.enabled && (
            <>
              <div role="radiogroup" aria-label="Важность" style={{ ...stackStyle, gap: 8 }}>
                <span style={labelStyle}>Важность</span>
                {SEVERITIES.map((severity) => (
                  <label key={severity} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Radio name="severity" checked={draft.severity === severity} onChange={() => update({ severity })} />
                    <span>
                      {SEVERITY_LABELS[severity]}
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}> — {SEVERITY_HINTS[severity]}</span>
                    </span>
                  </label>
                ))}
              </div>

              {rule.check === 'MIN_LENGTH' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={labelStyle}>Не короче, символов</span>
                  <Input size="large" inputMode="numeric" value={draft.minLength} onChange={(event) => update({ minLength: event.target.value })} />
                </label>
              )}
              {rule.check === 'ONE_OF' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={labelStyle}>Допустимые значения — по одному в строке</span>
                  <Textarea value={draft.allowedValues} onChange={(event) => update({ allowedValues: event.target.value })} />
                </label>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Текст замечания — его увидит автор документа</span>
                <Textarea value={draft.description} onChange={(event) => update({ description: event.target.value })} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Основание — документ компании</span>
                <Input
                  size="large"
                  value={draft.sourceTitle}
                  placeholder="Например, Инструкция по делопроизводству ООО «Ромашка»"
                  onChange={(event) => update({ sourceTitle: event.target.value })}
                />
                <Input
                  size="large"
                  value={draft.sourceRef}
                  placeholder="Пункт, например п. 2.5"
                  onChange={(event) => update({ sourceRef: event.target.value })}
                />
                {rule.kind === 'PRODUCT_RULE' && (
                  <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    Сейчас это рекомендация сервиса. Укажете свой документ — станет правилом компании.
                  </span>
                )}
              </label>
            </>
          )}

          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            Действует для новых проверок. Черновики — после «Проверить заново», документы на согласовании не меняются.
          </span>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button stretched variant="primary" loading={busy === 'save'} disabled={busy !== null} onClick={() => void save()}>
            Сохранить
          </Button>
          {rule.customized && (
            <Button stretched variant="secondary" loading={busy === 'reset'} disabled={busy !== null} onClick={() => void reset()}>
              Сбросить к типовому
            </Button>
          )}
          {rule.customized && (
            <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              В шаблоне: {SEVERITY_LABELS[rule.template.severity]} · {KIND_LABELS[rule.template.kind]}
            </span>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
