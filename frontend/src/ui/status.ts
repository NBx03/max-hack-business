import type { IconName } from './icons';

// Статусы документа и решения по шагу — один словарь тонов на всё приложение (DOC-6): метка документа, точки
// таймлайна и статусы людей берут цвет, иконку и слово отсюда, поэтому одинаковое значение не может получить
// два разных цвета. Цвет тона — токен (ui/tokens.css), не HEX.

export type DocumentStatus = 'DRAFT' | 'IN_APPROVAL' | 'APPROVED' | 'RETURNED' | 'REJECTED';
export type StepDecision = 'PENDING' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'SKIPPED';
/**
 * AUTHOR_HOLDS_ROLE — согласовано автоматически: роль только у автора. CARRIED_OVER — одобрение прошлой версии
 * сохранилось: документ не менялся. MEMBER_REMOVED — согласующего исключили или сняли роль, документ вернулся автору.
 */
export type AutoReason = 'AUTHOR_HOLDS_ROLE' | 'CARRIED_OVER' | 'MEMBER_REMOVED' | null;

export type StatusTone = 'neutral' | 'progress' | 'endorse' | 'warning' | 'danger' | 'success';

export interface StatusMeta {
  text: string;
  tone: StatusTone;
  icon: IconName;
}

const DOCUMENT_STATUS_META: Record<DocumentStatus, StatusMeta> = {
  DRAFT: { text: 'Черновик', tone: 'neutral', icon: 'draft' },
  IN_APPROVAL: { text: 'На согласовании', tone: 'progress', icon: 'clock' },
  RETURNED: { text: 'Возвращён', tone: 'warning', icon: 'return' },
  REJECTED: { text: 'Отклонён', tone: 'danger', icon: 'cross' },
  APPROVED: { text: 'Согласован', tone: 'success', icon: 'check' },
};

const STEP_DECISION_META: Record<StepDecision, StatusMeta> = {
  PENDING: { text: 'Ждёт', tone: 'progress', icon: 'clock' },
  APPROVED: { text: 'Согласовано', tone: 'success', icon: 'check' },
  RETURNED: { text: 'Возвращено на доработку', tone: 'warning', icon: 'return' },
  REJECTED: { text: 'Отклонено', tone: 'danger', icon: 'cross' },
  SKIPPED: { text: 'Не понадобилось', tone: 'neutral', icon: 'close' },
};

export const DOCUMENT_STATUSES: DocumentStatus[] = ['DRAFT', 'IN_APPROVAL', 'RETURNED', 'APPROVED', 'REJECTED'];

export function documentStatusMeta(status: DocumentStatus): StatusMeta {
  return DOCUMENT_STATUS_META[status];
}

/** Автоматические отметки переопределяют текст решения — пояснение обязательно видно в истории (CLAUDE.md, №10). */
export function stepDecisionMeta(decision: StepDecision, autoReason?: AutoReason): StatusMeta {
  if (decision === 'APPROVED' && autoReason === 'AUTHOR_HOLDS_ROLE') {
    return { text: 'Согласовано автором', tone: 'success', icon: 'check' };
  }
  if (decision === 'APPROVED' && autoReason === 'CARRIED_OVER') {
    return { text: 'Согласовано ранее', tone: 'success', icon: 'check' };
  }
  if (autoReason === 'MEMBER_REMOVED') {
    return { text: 'Выбыл', tone: 'warning', icon: 'return' };
  }
  return STEP_DECISION_META[decision];
}
