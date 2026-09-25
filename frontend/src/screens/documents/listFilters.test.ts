import { describe, expect, it } from 'vitest';
import type { DocumentListItem } from '../../api/types';
import { NO_MORE_PAGES, authorOptions, moreFiltersCount, periodFrom, pluralDays, toQuery, waitingText, withPage } from './listFilters';

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

describe('ревью Ильи на #110', () => {
  const doc = (id: number) => ({ id }) as DocumentListItem;
  const page = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => doc(from + index));

  it('дубль между страницами не зацикливает «Показать ещё»: третий запрос — страница 2', () => {
    const first = page(1, 30);
    // между запросами документ 31 поднялся наверх: вторая страница вернула дубль 30 и 29 новых
    const afterSecond = withPage(NO_MORE_PAGES, first, [doc(30), ...page(32, 60)]);
    expect(afterSecond.nextPage).toBe(2);
    expect(afterSecond.extra).toHaveLength(29);
    expect(withPage(afterSecond, first, page(61, 90)).nextPage).toBe(3);
  });

  it('в фильтре «Автор» — все коллеги сразу и бывшие сотрудники из загруженных строк, без повторов', () => {
    const colleagues = [{ id: 2, fullName: 'Юрист' }, { id: 1, fullName: 'Бухгалтер' }];
    const seen = [{ id: 2, fullName: 'Юрист' }, { id: 9, fullName: 'Ушедший' }];
    expect(authorOptions(colleagues, seen).map((user) => user.id)).toEqual([1, 9, 2]);
  });
});
