import { useColorScheme } from '@maxhub/max-ui';
import { useEffect } from 'react';

/**
 * Тема токенов дизайн-системы — та же, что у MaxUI (ревью #110, п. 8). Иначе при разных темах клиента и системы
 * метки статусов были бы светлыми пятнами на тёмной странице или наоборот. Ставится внутри <MaxUI>.
 */
export function ThemeSync() {
  const scheme = useColorScheme();
  useEffect(() => {
    document.documentElement.dataset.theme = scheme === 'dark' ? 'dark' : 'light';
  }, [scheme]);
  return null;
}
