import type { CSSProperties } from 'react';
import {
  documentStatusMeta,
  stepDecisionMeta,
  type AutoReason,
  type DocumentStatus,
  type StepDecision,
  type StatusTone,
} from '../../theme/status';

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 500,
  lineHeight: 'normal',
  whiteSpace: 'nowrap',
};

function toneStyle(tone: StatusTone): CSSProperties {
  return {
    background: `var(--status-${tone}-bg)`,
    color: `var(--status-${tone}-fg)`,
  };
}

/** Метка статуса документа - docs/SCREENS.md, таблица статусов. */
export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const meta = documentStatusMeta(status);
  return (
    <span style={{ ...badgeStyle, ...toneStyle(meta.tone) }}>{meta.text}</span>
  );
}

/** Метка решения шага маршрута - тот же словарь тонов, что и у статуса документа. */
export function StepDecisionBadge({
  decision,
  autoReason,
}: {
  decision: StepDecision;
  autoReason?: AutoReason;
}) {
  const meta = stepDecisionMeta(decision, autoReason);
  return (
    <span style={{ ...badgeStyle, ...toneStyle(meta.tone) }}>{meta.text}</span>
  );
}
