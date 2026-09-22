import { Typography } from '@maxhub/max-ui';
import { CenteredColumn } from '../components/base/Layout';

/**
 * Временная заглушка экрана - сама вёрстка делается в других задачах (#1, #7, #18).
 * Здесь только название и номер из docs/SCREENS.md, чтобы навигация была видна и
 * проверяема уже сейчас (см. #53, "Готово, когда").
 */
export function ScreenStub({ title, issue }: { title: string; issue?: string }) {
  return (
    <CenteredColumn style={{ padding: 16 }}>
      <Typography.Title variant="medium">{title}</Typography.Title>
      <Typography.Text>{issue ? `Экран в разработке (${issue}).` : 'Экран в разработке.'}</Typography.Text>
    </CenteredColumn>
  );
}
