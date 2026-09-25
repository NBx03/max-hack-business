import type { DocumentType, RouteOverview } from '../../api/types';
import { Icon, List, Row, Section } from '../../ui';

/** Как на экране загрузки: по алфавиту, «Другой документ» последним. */
function byName(types: DocumentType[]): DocumentType[] {
  return [...types].sort((left, right) =>
    Number(left.code === 'GENERIC') - Number(right.code === 'GENERIC') || left.name.localeCompare(right.name, 'ru'));
}

/**
 * Кто и в каком порядке согласует каждый вид документа — стартовый маршрут (D3). Автор перед отправкой меняет
 * его как угодно, но обязательных не убирает: они отмечены замком.
 */
export function RoutesCard({ routes, types }: { routes: RouteOverview[]; types: DocumentType[] }) {
  const byType = new Map(routes.map((route) => [route.documentTypeId, route]));
  const rows = byName(types).filter((type) => byType.has(type.id));
  if (rows.length === 0) return null;
  return (
    <Section
      title="Маршруты согласования"
      hint="С этого маршрута начинается документ. Автор может его поменять, но не может убрать обязательных — они с замком."
    >
      <List label="Маршруты согласования">
        {rows.map((type) => (
          <Row
            key={type.id}
            title={type.name}
            subtitle={
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 4 }}>
                {byType.get(type.id)!.stages.map((stage, index) => (
                  <span key={stage.stageOrder} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {index > 0 && <span aria-hidden>→</span>}
                    {stage.participants.map((participant, i) => (
                      <span key={participant.role.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        {i > 0 && ' и '}
                        {participant.role.name}
                        {participant.mandatory && <Icon name="lock" size={13} label="обязательный" />}
                      </span>
                    ))}
                  </span>
                ))}
              </span>
            }
          />
        ))}
      </List>
    </Section>
  );
}
