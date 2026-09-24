// Запуски мини-приложения: какой запуск текущий и отработал ли уже его startParam.
//
// Почему это отдельный модуль. Кнопка «Открыть документ» в уведомлении бота открывает
// мини-приложение с startapp=d_<id>. Если приложение уже было открыто на другом экране,
// MAX не запускает его с нуля: либо перезагружает страницу по текущему пути, либо только
// меняет хэш адреса с новыми данными запуска (WebAppData). Раньше в обоих случаях startParam
// игнорировался: он срабатывал лишь на пути «/», а мост MAX читает данные запуска из хэша
// один раз, при загрузке страницы. Человек нажимал кнопку и оставался на прежнем экране.
//
// Теперь «новый запуск» определяется по самим данным запуска (initData уникальна для каждого
// открытия), а смена хэша перезагружает страницу — мост перечитает свежие данные.

import { getWebApp } from '../max/webApp';

const HANDLED_LAUNCH_KEY = 'approval.handledLaunch';
const WEB_APP_DATA_PARAM = 'WebAppData';

/** Короткий отпечаток строки: в sessionStorage не кладём саму подписанную initData. */
function fingerprint(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return `${value.length}:${hash >>> 0}`;
}

function currentLaunchId(): string {
  return fingerprint(getWebApp()?.initData ?? '');
}

function readStorage(): string | null {
  try {
    return sessionStorage.getItem(HANDLED_LAUNCH_KEY);
  } catch {
    return null;
  }
}

/** startParam этого запуска уже отработал — повторно по нему не переходим. */
export function isLaunchHandled(): boolean {
  return readStorage() === currentLaunchId();
}

export function markLaunchHandled(): void {
  try {
    sessionStorage.setItem(HANDLED_LAUNCH_KEY, currentLaunchId());
  } catch {
    // Без sessionStorage (приватный режим) startParam отработает и после перезагрузки —
    // это безопасно: доступ к документу всё равно проверяет бэкенд.
  }
}

/** Данные запуска из хэша адреса — в том виде, в каком их туда кладёт MAX. */
export function launchDataFromHash(hash: string): string | null {
  try {
    return new URLSearchParams(hash.replace(/^#/, '')).get(WEB_APP_DATA_PARAM);
  } catch {
    return null;
  }
}

/** В хэше адреса новые данные запуска, а мост MAX всё ещё работает со старыми. */
function hasNewerLaunchData(): boolean {
  const next = launchDataFromHash(window.location.hash);
  return Boolean(next) && next !== getWebApp()?.initData;
}

/**
 * Следит за повторным открытием уже открытого мини-приложения (приёмка 24.09, п. 6). Если MAX поменял
 * только хэш (новые данные запуска без перезагрузки), перезагружаем страницу: мост MAX читает initData
 * лишь при загрузке, и без перезагрузки все запросы ушли бы со старыми данными запуска, а переход
 * по ссылке из уведомления не случился бы. Проверяем не только hashchange: смену адреса фрейма
 * браузер может сообщить и как popstate, а возвращение к открытому приложению — как focus или
 * visibilitychange.
 *
 * Как именно MAX передаёт повторное открытие, в документации моста не описано (сверено с
 * dev.max.ru/docs/webapps/bridge 24.09). Поэтому сообщения моста и смена хэша пишутся в консоль
 * с меткой [approval] (уровень debug): так поведение конкретного клиента MAX можно проверить.
 */
export function watchRelaunch(): void {
  const check = (reason: string) => {
    if (hasNewerLaunchData()) {
      console.debug('[approval] новый запуск мини-приложения:', reason);
      window.location.reload();
    }
  };
  window.addEventListener('hashchange', () => check('hashchange'));
  window.addEventListener('popstate', () => check('popstate'));
  window.addEventListener('pageshow', () => check('pageshow'));
  window.addEventListener('focus', () => check('focus'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check('visibilitychange');
  });
  window.addEventListener('message', (event) => {
    if (typeof event.data === 'string' && event.data.includes('"type":"WebApp')) {
      console.debug('[approval] сообщение моста MAX:', event.data.slice(0, 120));
    }
  });
}
