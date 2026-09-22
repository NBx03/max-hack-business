// Метка статуса документа и метка решения шага - см. docs/SCREENS.md, "Общие правила",
// и docs/API_CONTRACTS.md (DocumentStatus, Decision). Значения статуса документа и решения
// шага частично совпадают буквально (APPROVED/RETURNED/REJECTED) - поэтому цвет и текст
// берутся из одного словаря тонов, а не дублируются на каждом уровне по отдельности:
// иначе для одинакового значения enum можно было бы случайно завести два разных цвета
// (см. задачу #50, ревью цвета RETURNED).

export type DocumentStatus = 'DRAFT' | 'IN_APPROVAL' | 'APPROVED' | 'RETURNED' | 'REJECTED';
export type StepDecision = 'PENDING' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'SKIPPED';
export type AutoReason = 'AUTHOR_HOLDS_ROLE' | null;

/** Тон задаёт цвет через переменные темы (theme/tokens.css) - не конкретный HEX. */
export type StatusTone = 'neutral' | 'progress' | 'warning' | 'danger' | 'success';

interface StatusMeta {
  text: string;
  tone: StatusTone;
}

const DOCUMENT_STATUS_META: Record<DocumentStatus, StatusMeta> = {
  DRAFT: { text: 'Черновик', tone: 'neutral' },
  IN_APPROVAL: { text: 'На согласовании', tone: 'progress' },
  RETURNED: { text: 'Возвращён', tone: 'warning' },
  REJECTED: { text: 'Отклонён', tone: 'danger' },
  APPROVED: { text: 'Согласован', tone: 'success' },
};

const STEP_DECISION_META: Record<StepDecision, StatusMeta> = {
  PENDING: { text: 'Ждёт', tone: 'progress' },
  APPROVED: { text: 'Согласовано', tone: 'success' },
  RETURNED: { text: 'Возвращено', tone: 'warning' },
  REJECTED: { text: 'Отклонено', tone: 'danger' },
  SKIPPED: { text: 'Пропущено', tone: 'neutral' },
};

export function documentStatusMeta(status: DocumentStatus): StatusMeta {
  return DOCUMENT_STATUS_META[status];
}

/**
 * `autoReason = AUTHOR_HOLDS_ROLE` переопределяет текст APPROVED на «Согласовано автором» -
 * это тот же успешный тон, но пояснение обязательно видно в истории (CLAUDE.md, проверка №10).
 */
export function stepDecisionMeta(decision: StepDecision, autoReason?: AutoReason): StatusMeta {
  if (decision === 'APPROVED' && autoReason === 'AUTHOR_HOLDS_ROLE') {
    return { text: 'Согласовано автором', tone: 'success' };
  }
  return STEP_DECISION_META[decision];
}
