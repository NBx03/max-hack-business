import { describe, expect, it } from 'vitest';
import { COMPANY_CITIES, defaultCity, mskLabel, supportedZone, todayIn } from './companyTime';

// Город и часовой пояс компании (#56): «сегодня» — по поясу компании, а не по часам телефона.

describe('companyTime', () => {
  it('пояс телефона — к поясу из списка; не российский — никакой', () => {
    expect(supportedZone('Asia/Novosibirsk')).toBe('Asia/Novosibirsk');
    expect(supportedZone('Asia/Tomsk')).toBe('Asia/Novosibirsk');
    expect(supportedZone('Europe/Volgograd')).toBe('Europe/Moscow');
    expect(supportedZone('Europe/London')).toBeNull();
    expect(supportedZone(undefined)).toBeNull();
  });

  it('город по умолчанию — первый город пояса телефона, иначе Москва', () => {
    expect(defaultCity('Asia/Tomsk').city).toBe('Новосибирск');
    expect(defaultCity('America/New_York').city).toBe('Москва');
    expect(defaultCity(null).city).toBe('Москва');
  });

  it('у каждого города пояс из списка сервера, названия не повторяются', () => {
    expect(COMPANY_CITIES.every((item) => supportedZone(item.timeZone) === item.timeZone)).toBe(true);
    expect(new Set(COMPANY_CITIES.map((item) => item.city)).size).toBe(COMPANY_CITIES.length);
  });

  it('разница с Москвой — коротко', () => {
    expect(mskLabel('Europe/Moscow')).toBe('МСК');
    expect(mskLabel('Asia/Novosibirsk')).toBe('МСК+4');
    expect(mskLabel('Europe/Kaliningrad')).toBe('МСК−1');
  });

  it('одно мгновение — разные «сегодня» у компаний в разных поясах', () => {
    const now = new Date('2026-09-26T18:40:00Z');
    expect(todayIn('Europe/Moscow', now)).toEqual({ year: 2026, month: 9, day: 26 });
    expect(todayIn('Asia/Novosibirsk', now)).toEqual({ year: 2026, month: 9, day: 27 });
  });
});
