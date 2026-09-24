import { describe, expect, it } from 'vitest';
import { ruleBasis, ruleTitle } from './ruleText';

// Как правило называется на экране «Правила проверки» (#91): человеческими словами, без кодов проверок.

describe('ruleTitle', () => {
  it('описывает проверку словами и показывает настроенное значение', () => {
    expect(ruleTitle({ check: 'REQUIRED', fieldLabel: 'Кому', minLength: null, allowedValues: null })).toBe('«Кому» заполнено');
    expect(ruleTitle({ check: 'MIN_LENGTH', fieldLabel: 'Текст', minLength: 100, allowedValues: null }))
      .toBe('«Текст» — не короче 100 символов');
    expect(ruleTitle({ check: 'ONE_OF', fieldLabel: 'Вид отпуска', minLength: null, allowedValues: ['ежегодный', 'учебный'] }))
      .toBe('«Вид отпуска» — одно из: ежегодный, учебный');
  });
});

describe('ruleBasis', () => {
  it('у рекомендации сервиса нет документа-основания', () => {
    expect(ruleBasis({ kind: 'PRODUCT_RULE', sourceTitle: 'Правило продукта', sourceRef: null })).toBe('Рекомендация сервиса');
  });

  it('у правила компании — документ и пункт', () => {
    expect(ruleBasis({ kind: 'INTERNAL_POLICY', sourceTitle: 'Инструкция ООО «Ромашка»', sourceRef: 'п. 2.5' }))
      .toBe('Правило оформления: Инструкция ООО «Ромашка», п. 2.5');
  });
});
