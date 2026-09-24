import type { CompanyRule, RuleKind, Severity } from '../../api/types';

// Подписи правил проверки — одни и те же на экране правил и на экране проверки документа (#91).

export const SEVERITY_LABELS: Record<Severity, string> = {
  BLOCKER: 'Критично',
  WARNING: 'Предупреждение',
  INFO: 'Совет',
};

/** Что важность значит для автора — подсказка при настройке. */
export const SEVERITY_HINTS: Record<Severity, string> = {
  BLOCKER: 'Документ нельзя отправить, пока не исправят',
  WARNING: 'Замечание видно, отправить можно',
  INFO: 'Мягкая подсказка',
};

export const KIND_LABELS: Record<RuleKind, string> = {
  LEGAL: 'Требование закона',
  INTERNAL_POLICY: 'Правило оформления',
  PRODUCT_RULE: 'Рекомендация сервиса',
};

/** Что проверяет правило — человеческими словами, из вида проверки и подписи поля. */
export function ruleTitle(rule: Pick<CompanyRule, 'check' | 'fieldLabel' | 'minLength' | 'allowedValues'>): string {
  const field = `«${rule.fieldLabel}»`;
  switch (rule.check) {
    case 'REQUIRED':
      return `${field} заполнено`;
    case 'DATE_FORMAT':
      return `${field} — полная дата`;
    case 'DATE_NOT_FUTURE':
      return `${field} — не позже сегодняшнего дня`;
    case 'MATCHES_PATTERN':
      return `${field} — в принятом формате`;
    case 'MIN_LENGTH':
      return `${field} — не короче ${rule.minLength ?? '?'} символов`;
    case 'ONE_OF':
      return `${field} — одно из: ${(rule.allowedValues ?? []).join(', ')}`;
  }
}

/**
 * Основание правила одной строкой; у рекомендации сервиса источника нет — это наше допущение. short — для
 * карточки: без пояснения в скобках («утв. приказом…», «вымышленный локальный акт…»), полностью — в настройке.
 */
export function ruleBasis(rule: Pick<CompanyRule, 'kind' | 'sourceTitle' | 'sourceRef'>, short = false): string {
  if (rule.kind === 'PRODUCT_RULE') return KIND_LABELS.PRODUCT_RULE;
  const title = short ? shortTitle(rule.sourceTitle) : rule.sourceTitle;
  const ref = rule.sourceRef ? `, ${rule.sourceRef}` : '';
  return `${KIND_LABELS[rule.kind]}: ${title}${ref}`;
}

export function shortTitle(title: string): string {
  const cut = title.indexOf(' (');
  return cut > 0 ? title.slice(0, cut) : title;
}
