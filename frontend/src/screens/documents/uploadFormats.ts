// Какие файлы подходят основным файлом документа (UPL-1, UPL-2, UPL-6, D1). Проверка — сразу после выбора, до отправки,
// чтобы ошибка появилась в зоне загрузки, а не внизу страницы после ожидания. Сервер проверяет ещё раз — по содержимому.

/** Шаги создания документа (UPL-3) — одинаковые на экранах загрузки, проверки и маршрута. */
export const CREATE_STEPS = ['Файл', 'Проверка', 'Маршрут'];

export const MAX_FILE_MB = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/** Для атрибута accept: браузер и MAX сразу предлагают только подходящие файлы. */
export const MAIN_FILE_ACCEPT = [
  '.pdf',
  '.docx',
  '.doc',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
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
  if (!format) {
    if (IMAGE.test(extension(file.name)) || file.type.startsWith('image/')) {
      return 'Фото не подходит. Загрузите PDF, DOCX или DOC — например, сохраните документ из Word.';
    }
    return `Файл «${file.name}» не подходит. Загрузите PDF, DOCX или DOC.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `Файл больше ${MAX_FILE_MB} МБ. Уменьшите его или загрузите основную часть, остальное — приложениями.`;
  }
  if (file.size === 0) {
    return 'Файл пустой — выберите другой.';
  }
  return null;
}

/** DOC ИИ не читает: такой файл проходит маршрут, но поля заполняются вручную (D1). */
export function hasLimitedCheck(file: { name: string; type: string }): boolean {
  return formatOf(file) === 'doc';
}
