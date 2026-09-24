import { Typography } from '@maxhub/max-ui';
import type { DocumentType, RouteOverview } from '../../api/types';
import { sectionStyle, stackStyle } from '../documents/DocumentFormParts';

/** Как на экране загрузки: по алфавиту, «Другой документ» последним. */
function byName(types: DocumentType[]): DocumentType[] {
  return [...types].sort((left, right) =>
    Number(left.code === 'GENERIC') - Number(right.code === 'GENERIC') || left.name.localeCompare(right.name, 'ru'));
}

/**
 * Кто и в каком порядке согласует каждый вид документа (приёмка 24.09, п. 2: было непонятно, откуда берутся
 * согласующие). Только чтение: маршрут задан для компании, автор расширяет его перед отправкой.
 */
export function RoutesCard({ routes, types }: { routes: RouteOverview[]; types: DocumentType[] }) {
  const byType = new Map(routes.map((route) => [route.documentTypeId, route]));
  const rows = byName(types).filter((type) => byType.has(type.id));
  if (rows.length === 0) return null;
  return (
    <section style={sectionStyle}>
      <div style={{ ...stackStyle, gap: 4 }}>
        <Typography.Headline variant="small">Маршруты согласования</Typography.Headline>
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Перед отправкой автор может добавить согласующих.
        </span>
      </div>
      <div style={{ ...stackStyle, gap: 12 }}>
        {rows.map((type) => (
          <div key={type.id} style={{ ...stackStyle, gap: 2 }}>
            <strong style={{ fontSize: 15 }}>{type.name}</strong>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {byType.get(type.id)!.stages
                .map((stage) => stage.participants
                  .map((participant) => participant.role.name + (participant.mandatory ? '' : ' (если есть)'))
                  .join(' и '))
                .join(' → ')}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
