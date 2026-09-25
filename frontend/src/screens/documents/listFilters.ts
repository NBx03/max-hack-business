import type { DocumentListFilters } from '../../api/documents';
import type { DisplayStatus } from '../../api/types';

// Фильтры списков документов (NAV-3) — чистые функции, покрыты listFilters.test.ts.

/** «день»/«дня»/«дней» — обычные русские правила (11–14 всегда «дней»). */
export function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
  return 'дней';
}

/** «ждёт 3 дня» — для раздела «На моём согласовании». */
export function waitingText(iso: string, now: number = Date.now()): string {
  const days = Math.max(0, Math.floor((now - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
  return days === 0 ? 'ждёт с сегодня' : `ждёт ${days} ${pluralDays(days)}`;
}

/**
 * Период создания — готовыми вариантами, а не двумя полями даты: у нативного поля даты формат берётся из языка
 * браузера («мм/дд/гггг» в англоязычном), и на телефоне это ещё и системный пикер (ревью #110, п. 9; замечание Никиты).
 */
export type PeriodKey = 'week' | 'month' | 'quarter' | 'year';

export const PERIODS: { key: PeriodKey; label: string; days: number }[] = [
  { key: 'week', label: 'За 7 дней', days: 7 },
  { key: 'month', label: 'За 30 дней', days: 30 },
  { key: 'quarter', label: 'За 3 месяца', days: 91 },
  { key: 'year', label: 'За год', days: 365 },
];

/** Фильтры экрана: всё, что уходит на сервер, но период — ключом, а не датами. */
export type ListFilters = Omit<DocumentListFilters, 'from' | 'to' | 'page' | 'size'> & { period?: PeriodKey };

/** Дата начала периода (включительно), YYYY-MM-DD по местному времени: «за 7 дней» — сегодня и шесть дней до. */
export function periodFrom(key: PeriodKey, now: Date = new Date()): string {
  const days = PERIODS.find((period) => period.key === key)?.days ?? 0;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

/** Параметры запроса списка из фильтров экрана. */
export function toQuery(filters: ListFilters, page: number, size: number, now: Date = new Date()): DocumentListFilters {
  const { period, ...rest } = filters;
  return { ...rest, ...(period ? { from: periodFrom(period, now) } : {}), page, size };
}

/** Сколько фильтров выбрано в панели «Фильтры» (статус и поиск — отдельно, на виду). */
export function moreFiltersCount(filters: ListFilters): number {
  return [filters.typeId, filters.authorId, filters.period].filter((value) => value !== undefined).length;
}

/** Статусы, которые бывают в разделе: у чужих нет черновиков, в «На моём согласовании» статус один. */
export const LIST_STATUSES: Record<'waiting' | 'mine' | 'shared', DisplayStatus[]> = {
  waiting: [],
  mine: ['DRAFT', 'IN_APPROVAL', 'IN_ENDORSEMENT', 'RETURNED', 'ENDORSED', 'APPROVED', 'REJECTED'],
  shared: ['IN_APPROVAL', 'IN_ENDORSEMENT', 'RETURNED', 'ENDORSED', 'APPROVED', 'REJECTED'],
};
