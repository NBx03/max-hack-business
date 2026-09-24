import { Typography } from '@maxhub/max-ui';
import type { OrganizationMetrics } from '../../api/types';
import { sectionStyle, stackStyle } from '../documents/DocumentFormParts';

function documentsLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} документу`;
  return `${count} документам`;
}

/** Меньше часа — словами: «0 ч» читалось как «мгновенно» или как ошибка (приёмка 24.09). */
function formatDuration(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return 'меньше часа';
  if (hours < 48) return `${Math.round(hours)} ч`;
  return `${Math.round(hours / 24)} дн.`;
}

function formatRate(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

/**
 * Показатели согласования в компании — ровно то, что сервис обещает улучшить: срок согласования
 * и долю возвратов на доработку. Раньше блок назывался «Эффект согласования» и стоял над списком
 * документов; название было непонятно без пояснений (приёмка 24.09), а список уезжал вниз.
 */
export function MetricsCard({ metrics }: { metrics: OrganizationMetrics }) {
  const item = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 } as const;
  return (
    <section aria-labelledby="metrics-title" style={sectionStyle}>
      <div style={{ ...stackStyle, gap: 4 }}>
        <Typography.Headline id="metrics-title" variant="small">Показатели согласования</Typography.Headline>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {metrics.documentsCount === 0
            ? 'Появятся, когда в компании отправят первый документ на согласование.'
            : `По ${documentsLabel(metrics.documentsCount)}, отправленным на согласование.`}
        </span>
      </div>
      {metrics.documentsCount > 0 && (
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={item}>
            <Typography.Headline variant="large-strong">{formatDuration(metrics.medianApprovalHours)}</Typography.Headline>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>обычно проходит от отправки до «Согласован»</span>
          </div>
          <div style={item}>
            <Typography.Headline variant="large-strong">{formatRate(metrics.returnRate)}</Typography.Headline>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>документов хотя бы раз вернули на доработку</span>
          </div>
        </div>
      )}
    </section>
  );
}
