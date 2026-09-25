import { describe, expect, it } from 'vitest';
import { fileProblem, hasLimitedCheck } from './uploadFormats';

describe('какие файлы подходят (UPL-2, UPL-6)', () => {
  const file = (name: string, type = '', size = 1024) => ({ name, type, size });

  it('PDF, DOCX и DOC подходят — по расширению или по типу', () => {
    expect(fileProblem(file('Записка.PDF'))).toBeNull();
    expect(fileProblem(file('Записка.docx'))).toBeNull();
    expect(fileProblem(file('Приказ.doc'))).toBeNull();
    expect(fileProblem(file('scan', 'application/pdf'))).toBeNull();
  });

  it('фото — понятным текстом, остальное — с именем файла', () => {
    expect(fileProblem(file('IMG_2031.jpg', 'image/jpeg'))).toMatch(/^Фото не подходит/);
    expect(fileProblem(file('photo.HEIC'))).toMatch(/^Фото не подходит/);
    expect(fileProblem(file('Смета.xlsx'))).toBe('Файл «Смета.xlsx» не подходит. Загрузите PDF, DOCX или DOC.');
  });

  it('слишком большой и пустой файл', () => {
    expect(fileProblem(file('big.pdf', '', 10 * 1024 * 1024 + 1))).toMatch(/больше 10 МБ/);
    expect(fileProblem(file('empty.pdf', '', 0))).toMatch(/пустой/);
  });

  it('ограниченная проверка — только у DOC', () => {
    expect(hasLimitedCheck(file('Приказ.doc'))).toBe(true);
    expect(hasLimitedCheck(file('Приказ.docx'))).toBe(false);
  });
});

describe('вид «Другого документа» (DOC-7)', () => {
  it('заглавные — как обычное слово, остальное — как есть', async () => {
    const { kindLabel, recognizedKindOf } = await import('./documentKind');
    expect(kindLabel('АКТ')).toBe('Акт');
    expect(kindLabel('Договор аренды')).toBe('Договор аренды');
    expect(kindLabel('№ 5')).toBe('№ 5');
    const check = { versionNo: 1, status: 'CHECKED' as const, modelAvailable: true, issues: [],
      fields: [{ name: 'doc_kind', value: 'ПРИКАЗ', source: 'MODEL' as const, quote: null, page: null }] };
    expect(recognizedKindOf('GENERIC', check)).toEqual({ value: 'Приказ', fromAi: true });
    expect(recognizedKindOf('OFFICIAL_MEMO', check)).toBeNull();
  });
});
