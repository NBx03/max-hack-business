// Какие файлы подходят основным файлом документа (UPL-1, UPL-2, UPL-6, D1): PDF и DOCX. DOC не принимаем (D1, пересмотрено
// 26.09): ИИ его не читает, а полуработающий формат выглядит недоделкой; человеку говорим, как пересохранить. Проверка — сразу после выбора, до отправки,
// чтобы ошибка появилась в зоне загрузки, а не внизу страницы после ожидания. Сервер проверяет ещё раз — по содержимому.

/** Шаги создания документа (UPL-3) — одинаковые на экранах загрузки, проверки и маршрута. */
export const CREATE_STEPS = ['Файл', 'Проверка', 'Маршрут'];

export const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/** Строка под зоной загрузки. */
export const MAIN_FILE_CAPTION = `PDF или DOCX · до ${MAX_FILE_MB} МБ`;

/** Совет для DOC — тот же, что у сервера (DocumentFileValidator). */
export const DOC_NOT_SUPPORTED = 'DOC — устаревший формат Word. Откройте файл в Word и сохраните как DOCX: «Файл → Сохранить как → Документ Word (.docx)».';

/** Для атрибута accept: браузер и MAX сразу предлагают только подходящие файлы. */
export const MAIN_FILE_ACCEPT = [
  '.pdf',
  '.docx',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

type Format = 'pdf' | 'docx' | 'doc';

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function formatOf(file: { name: string; type: string }): Format | null {
  const ext = extension(file.name);
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (ext === 'doc' || file.type === 'application/msword') return 'doc';
  return null;
}

const IMAGE = /^(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/;

/** Что не так с файлом — текстом для зоны загрузки; null — подходит. */
export function fileProblem(file: { name: string; type: string; size: number }): string | null {
  const format = formatOf(file);
  if (format === 'doc') {
    return DOC_NOT_SUPPORTED;
  }
  if (!format) {
    if (IMAGE.test(extension(file.name)) || file.type.startsWith('image/')) {
      return 'Фото не подходит. Загрузите PDF или DOCX — например, сохраните документ из Word.';
    }
    return `Файл «${file.name}» не подходит. Загрузите PDF или DOCX.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `Файл больше ${MAX_FILE_MB} МБ. Уменьшите его или загрузите основную часть, остальное — приложениями.`;
  }
  if (file.size === 0) {
    return 'Файл пустой — выберите другой.';
  }
  return null;
}

/** Коды сервера про сам основной файл: формат, битое содержимое, размер (API_CONTRACTS.md, «Ошибки»). */
const FILE_ERROR_CODES: ReadonlySet<string> = new Set(['FILE_TYPE_NOT_ALLOWED', 'FILE_INVALID', 'FILE_TOO_LARGE']);

/**
 * Текст ошибки, если сервер отверг сам основной файл, иначе null. Такую ошибку экран показывает у зоны файла и убирает
 * файл — он и есть причина; на первой загрузке и при замене файла одинаково (ревью #122, пп. 2–3). 413 без нашего
 * кода — это nginx: файл больше его лимита.
 */
export function fileErrorOf(error: unknown): string | null {
  if (!(error instanceof Error) || !('status' in error) || !('code' in error)) return null;
  const { status, code } = error as Error & { status: number; code: string };
  return FILE_ERROR_CODES.has(code) || status === 413 ? error.message : null;
}
