import { useState } from 'react';
import { AiGlyph, Icon } from './icons';
import { BottomSheet } from './Sheet';
import {
  documentStatusMeta,
  stepDecisionMeta,
  type AutoReason,
  type DisplayStatus,
  type StatusMeta,
  type StepDecision,
} from './status';

/** Метка тона: приглушённый фон, светлый текст того же оттенка, иконка + слово (принцип 10, DOC-6). */
export function StatusBadge({ meta }: { meta: StatusMeta }) {
  return (
    <span className={`ds-badge ds-badge--${meta.tone}`}>
      <Icon name={meta.icon} size={14} />
      {meta.text}
    </span>
  );
}

export function DocumentStatusBadge({ status }: { status: DisplayStatus }) {
  return <StatusBadge meta={documentStatusMeta(status)} />;
}

export function StepDecisionBadge({ decision, autoReason }: { decision: StepDecision; autoReason?: AutoReason }) {
  return <StatusBadge meta={stepDecisionMeta(decision, autoReason)} />;
}

/** Значение получено от ИИ: маленький ✦ рядом с ним — только там, где это правда (DOC-7), не как декор. */
export function AiMark() {
  return (
    <span className="ds-ai" aria-label="значение от ИИ" role="img">
      <AiGlyph />
    </span>
  );
}

/**
 * ✦, который объясняет себя: нажатие (зона 44×44) открывает нижнюю панель «что это значит» (DECISIONS.md,
 * противоречие 11). Ставится в заголовке блока значений от ИИ; рядом — строка «✦ — заполнено ИИ, проверьте».
 */
export function AiExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ds-ai-button" aria-label="Что значит ✦" onClick={() => setOpen(true)}>
        <AiGlyph size={16} />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="✦ — значение от ИИ">
        <p className="ds-text-secondary">
          Так отмечено то, что ИИ нашёл в тексте документа: вид документа, поля, краткое содержание.
        </p>
        <p className="ds-text-secondary">
          ИИ может ошибиться — сверьте с документом. Решения по документу ИИ не принимает: замечания проверяет
          обычный код по правилам компании, а согласуют люди.
        </p>
        <p className="ds-text-secondary">Неверное значение исправьте в поле — проверка пройдёт заново.</p>
      </BottomSheet>
    </>
  );
}

/** Строка-легенда под заголовком блока значений от ИИ. */
export function AiLegend() {
  return (
    <p className="ds-section__hint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <AiMark /> — заполнено ИИ, проверьте
    </p>
  );
}
