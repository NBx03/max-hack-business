import type { DocumentCard, DocumentVersion, StepView } from '../../api/types';
import { documentStatusMeta, stepDecisionMeta, type StatusMeta } from '../../ui';

/** Шаги маршрута этой версии: у текущей — этапы маршрута, у прошлых — история. */
export function versionSteps(doc: Pick<DocumentCard, 'currentVersionNo' | 'route'>, versionNo: number): StepView[] {
  if (!doc.route) return [];
  const steps = versionNo === doc.route.versionNo
    ? doc.route.stages.flatMap((stage) => stage.steps)
    : doc.route.history.filter((step) => step.versionNo === versionNo);
  return [...steps].sort((left, right) => left.stageOrder - right.stageOrder);
}

export interface VersionOutcome {
  meta: StatusMeta;
  /** Кто остановил версию — вернул, отклонил или выбыл; null — остановил не человек или никто. */
  step: StepView | null;
}

/**
 * Чем закончилась версия (#56: «у каждой версии должно быть видно её состояние»). Текущая — статусом документа, как
 * в шапке; прошлая — тем, почему понадобилась следующая: вернули, отозвал автор, выбыл согласующий или её заменили,
 * не отправляя.
 */
export function versionOutcome(
  doc: Pick<DocumentCard, 'currentVersionNo' | 'route' | 'displayStatus'>,
  version: Pick<DocumentVersion, 'versionNo' | 'withdrawnAt'>,
): VersionOutcome {
  const steps = versionSteps(doc, version.versionNo);
  if (version.withdrawnAt) {
    return { meta: { text: 'Отозвана автором', tone: 'warning', icon: 'return' }, step: null };
  }
  const rejected = steps.find((step) => step.decision === 'REJECTED');
  if (rejected) return { meta: { text: 'Отклонена', tone: 'danger', icon: 'cross' }, step: rejected };
  const returned = steps.find((step) => step.decision === 'RETURNED');
  if (returned) return { meta: { text: 'Возвращена на доработку', tone: 'warning', icon: 'return' }, step: returned };
  const removed = steps.find((step) => step.autoReason === 'MEMBER_REMOVED');
  if (removed) return { meta: { text: 'Вернулась автоматически', tone: 'warning', icon: 'return' }, step: removed };
  if (version.versionNo === doc.currentVersionNo) {
    return { meta: documentStatusMeta(doc.displayStatus), step: null };
  }
  if (steps.length === 0) {
    return { meta: { text: 'Не отправлялась', tone: 'neutral', icon: 'draft' }, step: null };
  }
  return { meta: { text: 'Заменена новой версией', tone: 'neutral', icon: 'draft' }, step: null };
}

/** Решение человека словом и значком; у утверждающего — «Утверждено» / «Ждёт утверждения» (D4). */
export function personMeta(step: StepView): StatusMeta {
  if (step.kind === 'ENDORSEMENT' && step.decision === 'APPROVED' && step.autoReason === 'CARRIED_OVER') {
    return { text: 'Утверждено ранее', tone: 'success', icon: 'endorse' };
  }
  if (step.kind === 'ENDORSEMENT' && step.decision === 'APPROVED' && !step.autoReason) {
    return { text: 'Утверждено', tone: 'success', icon: 'endorse' };
  }
  if (step.kind === 'ENDORSEMENT' && step.decision === 'PENDING') {
    return { text: 'Ждёт утверждения', tone: 'endorse', icon: 'clock' };
  }
  return stepDecisionMeta(step.decision, step.autoReason);
}
