import { describe, expect, it } from 'vitest';
import { budgetSummary, estimateLinePrice, parsePrice } from './budget';

describe('budget', () => {
  it('scales a known price to the quantity', () => {
    expect(
      estimateLinePrice({ quantity: 500, unit: 'g' }, { price: 3, quantity: 1, unit: 'kg' }),
    ).toBe(1.5);
    expect(
      estimateLinePrice({ quantity: 12, unit: null }, { price: 3, quantity: 6, unit: null }),
    ).toBe(6);
    expect(
      estimateLinePrice({ quantity: 2, unit: 'clove' }, { price: 1, quantity: 1, unit: 'g' }),
    ).toBe(1);
    expect(
      estimateLinePrice({ quantity: null, unit: null }, { price: 2.4, quantity: 1, unit: 'kg' }),
    ).toBe(2.4);
  });
  it('totals', () => {
    expect(
      budgetSummary([
        { price: 2.5, checked: true },
        { price: 4, checked: false },
        { price: null, checked: false },
      ]),
    ).toEqual({ total: 6.5, inCart: 2.5, unpriced: 1 });
  });
  it('reads typed prices', () => {
    expect(parsePrice('3,50 €')).toBe(3.5);
    expect(parsePrice('$4.2')).toBe(4.2);
    expect(parsePrice('abc')).toBeNull();
  });
});
