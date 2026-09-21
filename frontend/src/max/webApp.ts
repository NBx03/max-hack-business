/**
 * Минимальный интерфейс window.WebApp, который реально используется в проекте.
 * Библиотека подключается скриптом в index.html и создаёт этот объект сама -
 * никакой отдельной инициализации не требует (сверено с dev.max.ru/docs/webapps/bridge).
 */
export interface MaxWebApp {
  /** Подписанная, но не зашифрованная строка стартовых данных. Фронтенд её не разбирает,
   *  а целиком пересылает на бэкенд в заголовке Authorization. */
  initData: string;
  initDataUnsafe: {
    /** Значение из ссылки ?startapp=... Использовать можно только то, что вернул
     *  бэкенд в GET /me.startParam - оно разобрано из проверенной initData. */
    start_param?: string;
  };
  /** Нативное скачивание: работает только внутри MAX, требует нажатия пользователя. */
  downloadFile(url: string, fileName: string): void;
}

declare global {
  interface Window {
    WebApp?: MaxWebApp;
  }
}

export function getWebApp(): MaxWebApp | undefined {
  return window.WebApp;
}

/** Мини-приложение открыто внутри MAX и получило initData от моста. */
export function isInsideMax(): boolean {
  return Boolean(window.WebApp?.initData);
}
