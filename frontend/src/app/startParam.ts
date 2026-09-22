/**
 * Разбор параметра запуска из ссылки `https://max.ru/<бот>?startapp=<payload>`.
 * Доверяем только значению из `GET /me.startParam`: бэкенд берёт его из проверенной
 * подписи initData, а не из `window.WebApp.initDataUnsafe`.
 */
export type StartParam =
  | { kind: 'companyCode'; code: string }
  | { kind: 'personalInvite'; token: string }
  | { kind: 'document'; documentId: number }
  | { kind: 'none' };

export function parseStartParam(raw: string | null | undefined): StartParam {
  if (!raw) {
    return { kind: 'none' };
  }
  if (raw.startsWith('c_') && raw.length > 2) {
    return { kind: 'companyCode', code: raw.slice(2) };
  }
  if (raw.startsWith('p_') && raw.length > 2) {
    return { kind: 'personalInvite', token: raw.slice(2) };
  }
  if (raw.startsWith('d_')) {
    const id = Number(raw.slice(2));
    if (Number.isSafeInteger(id) && id > 0) {
      return { kind: 'document', documentId: id };
    }
  }
  return { kind: 'none' };
}

/**
 * Параметр запуска действует один раз за открытие приложения. Без этой отметки после
 * любого обновления сессии (отмена заявки, выход из демо) человека снова отбрасывало бы
 * на экран из ссылки.
 */
let consumed = false;

export function takeStartParam(raw: string | null | undefined): StartParam {
  if (consumed) {
    return { kind: 'none' };
  }
  consumed = true;
  return parseStartParam(raw);
}
