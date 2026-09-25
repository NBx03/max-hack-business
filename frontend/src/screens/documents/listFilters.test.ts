import { describe, expect, it } from 'vitest';
import { moreFiltersCount, periodFrom, pluralDays, toQuery, waitingText } from './listFilters';

describe('фильтры списков (NAV-3, ревью #110)', () => {
  it('склонение дней — 1 день, 2–4 дня, 5–20 и 11–14 дней', () => {
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(pluralDays)).toEqual([
      'день', 'дня', 'дня', 'дней', 'дней', 'дней', 'дней', 'день', 'дня', 'дней', 'день', 'дней',
    ]);
  });

  it('«ждёт» — с сегодня или N дней', () => {
    const now = new Date('2026-09-26T12:00:00Z').getTime();
    expect(waitingText('2026-09-26T08:00:00Z', now)).toBe('ждёт с сегодня');
    expect(waitingText('2026-09-23T08:00:00Z', now)).toBe('ждёт 3 дня');
  });

  it('период — дата начала включительно, в формате сервера', () => {
    const now = new Date(2026, 8, 26, 15, 0);
    expect(periodFrom('week', now)).toBe('2026-09-20');
    expect(periodFrom('month', now)).toBe('2026-08-28');
    expect(periodFrom('year', now)).toBe('2025-09-27');
  });

  it('запрос: период превращается в from, страница и размер — как попросили', () => {
    const now = new Date(2026, 8, 26);
    expect(toQuery({ status: 'DRAFT', q: 'акт', period: 'week' }, 2, 30, now)).toEqual({
      status: 'DRAFT', q: 'акт', from: '2026-09-20', page: 2, size: 30,
    });
    expect(toQuery({}, 0, 30, now)).toEqual({ page: 0, size: 30 });
  });

  it('счётчик на чипе «Фильтры» — без статуса и поиска, они и так на виду', () => {
    expect(moreFiltersCount({ status: 'DRAFT', q: 'x' })).toBe(0);
    expect(moreFiltersCount({ typeId: 1, period: 'month' })).toBe(2);
  });
});
