import { getAuthHeader } from './auth';
import { ApiError, type ApiErrorBody } from './errors';

const BASE_PATH = '/api/v1';

const GENERIC_ERROR_MESSAGE = 'Сервис временно недоступен, попробуйте ещё раз';
const FILE_TOO_LARGE_MESSAGE = 'Файл слишком большой: до 10 МБ на файл и 30 МБ на все файлы';
const AUTH_FAILED_MESSAGE = 'Не удалось подтвердить вход через MAX';

/**
 * Демо-участник хранится только здесь и передаётся в каждом запросе -
 * на сервере "текущий демо-пользователь" не хранится (docs/API_CONTRACTS.md).
 * SessionContext - источник истины для UI, эта переменная - её зеркало для клиента.
 */
let actingAsId: number | null = null;

export function setActingAsId(id: number | null): void {
  actingAsId = id;
}

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** true - body уже FormData (загрузка файлов), сериализовать в JSON не нужно. */
  isFormData?: boolean;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).code === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string'
  );
}

/** Запрос на относительный /api/v1/..., nginx проксирует на бэкенд - CORS не нужен. */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: getAuthHeader(),
  };
  if (actingAsId !== null) {
    headers['X-Demo-Act-As'] = String(actingAsId);
  }

  let body: BodyInit | undefined;
  if (options.isFormData) {
    body = options.body as FormData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${BASE_PATH}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const rawText = await response.text();
  let parsed: unknown = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Ответ не в JSON - страница nginx (413, 502, 504) или обрыв сети.
      parsed = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError(401, {
        code: isApiErrorBody(parsed) ? parsed.code : 'INIT_DATA_INVALID',
        message: AUTH_FAILED_MESSAGE,
      });
    }
    if (isApiErrorBody(parsed)) {
      throw new ApiError(response.status, parsed);
    }
    throw new ApiError(response.status, {
      code: 'UNKNOWN',
      message: response.status === 413 ? FILE_TOO_LARGE_MESSAGE : GENERIC_ERROR_MESSAGE,
    });
  }

  return parsed as T;
}
