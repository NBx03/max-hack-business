import { getWebApp } from '../max/webApp';
import { ApiError } from './errors';

/**
 * Заглушка только для разработки вне MAX - обычный браузер без window.WebApp.
 * Бэкенд принимает "Authorization: Dev <maxUserId>" только в профиле Spring `dev`.
 * import.meta.env.DEV - статическая константа Vite: в prod-сборке ветка ниже
 * не попадает в бандл (dead code elimination), заглушки в собранной версии нет.
 */
const DEV_FALLBACK_USER_ID = '1';

export function getAuthHeader(): string {
  const initData = getWebApp()?.initData;
  if (initData) {
    return `MaxInitData ${initData}`;
  }
  if (import.meta.env.DEV) {
    return `Dev ${DEV_FALLBACK_USER_ID}`;
  }
  throw new ApiError(401, {
    code: 'INIT_DATA_INVALID',
    message: 'Не удалось подтвердить вход через MAX',
  });
}
