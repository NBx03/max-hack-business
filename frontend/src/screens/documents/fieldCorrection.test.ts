import { describe, expect, it, vi } from 'vitest';
import type { DocumentCard } from '../../api/types';
import { applyCorrection, changedFields, sameValue, type CorrectionApi } from './fieldCorrection';

// «Исправить и проверить» — несколько запросов подряд, не атомарно (ревью #95, п. 1 и 4).

function card(versionNo: number, canEditFields: boolean): DocumentCard {
  return {
    id: 7,
    currentVersionNo: versionNo,
    permissions: { canEditFields },
    versions: [{ versionNo, containsSensitive: false, files: [{ id: 70 + versionNo }] }],
  } as unknown as DocumentCard;
}

describe('sameValue', () => {
  it('считает пустое и незаполненное одним и тем же', () => {
    expect(sameValue(null, '')).toBe(true);
    expect(sameValue(undefined, '   ')).toBe(true);
  });

  it('сравнивает непустые значения дословно, с пробелами', () => {
    expect(sameValue(' 7707083893', '7707083893')).toBe(false);
    expect(sameValue('Иванов', 'Иванов ')).toBe(false);
    expect(sameValue('Иванов', 'Иванов')).toBe(true);
  });

  it('находит исправление, которое состоит только из пробелов', () => {
    expect(changedFields({ inn: '7707083893', title: 'О закупке' }, { inn: ' 7707083893', title: 'О закупке' }))
      .toEqual([['inn', '7707083893']]);
  });
});

describe('applyCorrection', () => {
  it('отдаёт новую версию экрану сразу, даже если следующий шаг упал', async () => {
    const shown: number[] = [];
    const api: CorrectionApi = {
      correctFile: vi.fn().mockResolvedValue({ card: card(2, true), applied: ['doc_date'], notApplied: [] }),
      createDocumentVersion: vi.fn(),
      updateDocumentFields: vi.fn().mockRejectedValue(new Error('сеть')),
      getDocument: vi.fn(),
    };

    await expect(applyCorrection(api, card(1, true), { doc_date: '15.09.2026' }, { addressee: 'Директору' },
      (next) => shown.push(next.currentVersionNo))).rejects.toThrow('сеть');

    // экран уже на версии 2 — повтор не уйдёт с номером 1
    expect(shown).toEqual([2]);
    expect(api.updateDocumentFields).toHaveBeenCalledWith(7, 2, { addressee: 'Директору' });
  });

  it('у возвращённого документа сначала создаёт версию с теми же файлами и сообщает о ней', async () => {
    const shown: number[] = [];
    const api: CorrectionApi = {
      correctFile: vi.fn(),
      createDocumentVersion: vi.fn().mockResolvedValue(card(2, true)),
      updateDocumentFields: vi.fn().mockRejectedValue(new Error('тайм-аут')),
      getDocument: vi.fn(),
    };

    await expect(applyCorrection(api, card(1, false), {}, { addressee: 'Директору' },
      (next) => shown.push(next.currentVersionNo))).rejects.toThrow('тайм-аут');

    expect(api.createDocumentVersion).toHaveBeenCalledWith(7, { containsSensitive: false, keepFileIds: [71] });
    expect(shown).toEqual([2]);
  });

  it('при успехе возвращает свежую карточку и номер новой версии', async () => {
    const api: CorrectionApi = {
      correctFile: vi.fn().mockResolvedValue({ card: card(2, true), applied: [], notApplied: [{ field: 'x', message: 'нет' }] }),
      createDocumentVersion: vi.fn(),
      updateDocumentFields: vi.fn().mockResolvedValue({}),
      getDocument: vi.fn().mockResolvedValue(card(2, true)),
    };

    const outcome = await applyCorrection(api, card(1, true), { x: '1' }, { addressee: 'Директору' }, () => undefined);

    expect(outcome.versionNo).toBe(2);
    expect(outcome.notApplied).toEqual([{ field: 'x', message: 'нет' }]);
    expect(api.createDocumentVersion).not.toHaveBeenCalled();
  });
});
