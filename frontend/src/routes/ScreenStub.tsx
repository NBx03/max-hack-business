import { Button, Typography } from '@maxhub/max-ui';
import { useNavigate } from 'react-router-dom';
import { CenteredColumn } from '../components/base/Layout';
import { ROUTE_PATTERNS } from './paths';

/**
 * Временная заглушка экрана - сама вёрстка делается в других задачах (#54, #7).
 * Здесь только название и номер из docs/SCREENS.md, чтобы навигация была видна и
 * проверяема уже сейчас (см. #53, "Готово, когда"). Кнопка к документам - чтобы
 * заглушка не была тупиком: после создания компании роутер ведёт на "3. Приглашение".
 */
export function ScreenStub({ title, issue }: { title: string; issue?: string }) {
  const navigate = useNavigate();
  return (
    <CenteredColumn style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Typography.Title variant="medium">{title}</Typography.Title>
      <Typography.Text>{issue ? `Экран в разработке (${issue}).` : 'Экран в разработке.'}</Typography.Text>
      <Button variant="secondary" onClick={() => navigate(ROUTE_PATTERNS.documents)}>
        К документам
      </Button>
    </CenteredColumn>
  );
}
