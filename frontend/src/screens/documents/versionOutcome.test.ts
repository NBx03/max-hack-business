import { describe, expect, it } from 'vitest';
import type { DocumentCard, StepView } from '../../api/types';
import { versionOutcome, versionSteps } from './versionOutcome';

// История версий (#56): у каждой версии — чем она закончилась.

let nextId = 1;

function step(versionNo: number, decision: StepView['decision'], extra: Partial<StepView> = {}): StepView {
  return {
    id: nextId++,
    versionNo,
    stageOrder: 1,
    role: { id: 1, code: 'LAWYER', name: 'Юрист' },
    approver: { id: 7, fullName: 'Юрист' },
    origin: 'TEMPLATE',
    kind: 'APPROVAL',
    decision,
    comment: null,
    activatedAt: null,
    decidedAt: null,
    autoReason: null,
    ...extra,
  };
}

const doc = (steps: { current: StepView[]; history: StepView[] }, displayStatus: DocumentCard['displayStatus'] = 'IN_APPROVAL') => ({
  currentVersionNo: 3,
  displayStatus,
  route: { versionNo: 3, stages: [{ stageOrder: 1, state: 'ACTIVE' as const, steps: steps.current }], history: steps.history },
});

describe('versionOutcome', () => {
  const history = [step(1, 'RETURNED', { comment: 'уточните сумму' }), step(1, 'SKIPPED'), step(2, 'REJECTED')];
  const card = doc({ current: [step(3, 'PENDING')], history });

  it('прошлая версия — по решению, которое её остановило, и кто его принял', () => {
    const returned = versionOutcome(card, { versionNo: 1, withdrawnAt: null });
    expect(returned.meta.text).toBe('Возвращена на доработку');
    expect(returned.step?.comment).toBe('уточните сумму');
    expect(versionOutcome(card, { versionNo: 2, withdrawnAt: null }).meta.text).toBe('Отклонена');
  });

  it('отзыв автором важнее решений; версия без маршрута — «Не отправлялась»', () => {
    expect(versionOutcome(card, { versionNo: 1, withdrawnAt: '2026-09-26T10:00:00Z' }).meta.text).toBe('Отозвана автором');
    expect(versionOutcome(doc({ current: [], history: [] }), { versionNo: 2, withdrawnAt: null }).meta.text).toBe('Не отправлялась');
  });

  it('текущая версия без остановки — статусом документа, как в шапке', () => {
    expect(versionOutcome(card, { versionNo: 3, withdrawnAt: null }).meta.text).toBe(
      versionOutcome(doc({ current: [], history: [] }), { versionNo: 3, withdrawnAt: null }).meta.text,
    );
  });

  it('шаги версии: у текущей — этапы маршрута, у прошлой — её история', () => {
    expect(versionSteps(card, 3)).toHaveLength(1);
    expect(versionSteps(card, 1)).toHaveLength(2);
    expect(versionSteps({ currentVersionNo: 1, route: null }, 1)).toEqual([]);
  });
});
