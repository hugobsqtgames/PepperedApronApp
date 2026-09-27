import { describe, expect, it } from 'vitest';
import { convertAmount, formatAmount, formatNumber, normalizeAmount, parseNumber, parseQuantity, scaleAmount, scaleFactor } from './quantity';
import { celsiusToFahrenheit, fahrenheitToCelsius, resolveUnit, thermostatToCelsius, unitLabel } from './units';

const A = (quantity: number | null, unit: string | null, quantityMax: number | null = null) => ({ quantity, unit, quantityMax });

describe('parseNumber / parseQuantity', () => {
  it.each([
    ['1', 1], ['1.5', 1.5], ['1,5', 1.5], ['1/2', 0.5], ['1 1/2', 1.5], ['½', 0.5], ['1½', 1.5], ['1 ½', 1.5], ['¾', 0.75], ['10', 10],
  ])('%s → %d', (s, v) => expect(parseNumber(s)).toBeCloseTo(v));
  it('rejects division by zero and junk', () => {
    expect(parseNumber('1/0')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
  it('parses ranges', () => {
    expect(parseQuantity('2-3')).toEqual({ value: 2, max: 3 });
    expect(parseQuantity('2 à 3')).toEqual({ value: 2, max: 3 });
    expect(parseQuantity('2 to 3')).toEqual({ value: 2, max: 3 });
    expect(parseQuantity('3-2')).toEqual({ value: 3, max: null });
    expect(parseQuantity('0')).toBeNull();
  });
});

describe('scaling', () => {
  it('scales 2 → 4 persons exactly (spec example)', () => {
    const s = scaleAmount(A(250, 'g'), scaleFactor(2, 4));
    expect(s.quantity).toBe(500);
    expect(formatAmount(s, 'fr')).toBe('500');
  });
  it('invalid factors leave amounts untouched', () => {
    expect(scaleAmount(A(2, null), NaN).quantity).toBe(2);
    expect(scaleAmount(A(2, null), -1).quantity).toBe(2);
    expect(scaleFactor(0, 4)).toBe(1);
    expect(scaleFactor(null, 4)).toBe(1);
  });
  it('keeps null quantities (e.g. "sel, poivre")', () => {
    expect(scaleAmount(A(null, null), 3).quantity).toBeNull();
  });
  it('scales ranges', () => {
    expect(scaleAmount(A(2, null, 3), 2)).toMatchObject({ quantity: 4, quantityMax: 6 });
  });
  it('formats fractions for spoons and counts, decimals for metric', () => {
    expect(formatAmount(scaleAmount(A(1, 'tbsp'), 1.5), 'fr')).toBe('1 ½');
    expect(formatAmount(scaleAmount(A(3, null), 1 / 3), 'fr')).toBe('1');
    expect(formatAmount(scaleAmount(A(1, null), 2 / 3), 'en')).toBe('⅔');
    expect(formatAmount(A(1.5, 'kg'), 'fr')).toBe('1,5');
    expect(formatAmount(A(1.5, 'kg'), 'en')).toBe('1.5');
    expect(formatAmount(A(333.33, 'g'), 'fr')).toBe('335');
    expect(formatAmount(A(2, null, 3), 'fr')).toBe('2–3');
    expect(formatNumber(0.3, 'fr', true)).toBe('⅓');
  });
});

describe('normalize & convert', () => {
  it('upgrades/downgrades metric units', () => {
    expect(normalizeAmount(A(1500, 'g'))).toMatchObject({ quantity: 1.5, unit: 'kg' });
    expect(normalizeAmount(A(0.25, 'kg'))).toMatchObject({ quantity: 250, unit: 'g' });
    expect(normalizeAmount(A(1200, 'ml'))).toMatchObject({ quantity: 1.2, unit: 'l' });
    expect(normalizeAmount(A(0.25, 'l'))).toMatchObject({ quantity: 25, unit: 'cl' });
    expect(normalizeAmount(A(3, 'piece'))).toMatchObject({ quantity: 3, unit: 'piece' });
  });
  it('converts metric ↔ imperial', () => {
    expect(convertAmount(A(500, 'g'), 'imperial')).toMatchObject({ unit: 'lb' });
    expect(convertAmount(A(100, 'g'), 'imperial').unit).toBe('oz');
    expect(convertAmount(A(250, 'ml'), 'imperial').unit).toBe('cup');
    expect(convertAmount(A(1, 'cup'), 'metric')).toMatchObject({ quantity: 240, unit: 'ml' });
    expect(convertAmount(A(1, 'lb'), 'metric').unit).toBe('g');
    expect(convertAmount(A(2, 'tbsp'), 'imperial')).toMatchObject({ quantity: 2, unit: 'tbsp' });
  });
  it('temperatures', () => {
    expect(celsiusToFahrenheit(180)).toBe(355);
    expect(fahrenheitToCelsius(350)).toBe(175);
    expect(thermostatToCelsius(6)).toBe(180);
  });
  it('resolves unit aliases in 5 languages', () => {
    expect(resolveUnit('c. à soupe')?.key).toBe('tbsp');
    expect(resolveUnit('Esslöffel')?.key).toBe('tbsp');
    expect(resolveUnit('cucharadita')?.key).toBe('tsp');
    expect(resolveUnit('cucchiaio')?.key).toBe('tbsp');
    expect(resolveUnit('Tbsp')?.key).toBe('tbsp');
    expect(resolveUnit('verre')).toBeUndefined();
  });
  it('labels units per locale with plural', () => {
    expect(unitLabel('clove', 2, 'fr')).toBe('gousses');
    expect(unitLabel('tbsp', 1, 'de')).toBe('EL');
    expect(unitLabel('custom', 1, 'fr')).toBe('custom');
  });
});
