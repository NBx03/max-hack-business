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

/**
 * Следит за повторным открытием уже открытого мини-приложения. Если MAX поменял только хэш
 * (новые данные запуска без перезагрузки), перезагружаем страницу: мост MAX читает initData
 * лишь при загрузке, и без перезагрузки все запросы ушли бы со старыми данными запуска.
 */
export function watchRelaunch(): void {
  window.addEventListener('hashchange', () => {
    const next = launchDataFromHash(window.location.hash);
    if (next && next !== getWebApp()?.initData) {
      window.location.reload();
    }
  });
}
