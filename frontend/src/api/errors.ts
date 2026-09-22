/** Формат ошибки бэкенда - см. docs/API_CONTRACTS.md, раздел "Ошибки". */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

const GENERIC_MESSAGE = 'Сервис временно недоступен, попробуйте ещё раз';

/** Текст для пользователя: сообщение бэкенда или общий текст для сетевых сбоев. */
export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : GENERIC_MESSAGE;
}
