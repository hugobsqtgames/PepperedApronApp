import { describe, expect, it } from 'vitest';
import { parseIngredientLine } from './parse/ingredient';
import { parseRecipeText } from './parse/text';
import { parseSearchQuery } from './search';
import { formatAmount, parseQuantity } from './quantity';

/** Inputs a real user (or a cat on the keyboard) can produce. Nothing may throw or hang. */
describe('absurd inputs', () => {
  it('survives 100 000 pasted characters quickly', () => {
    const junk = 'Farine 200 g 🍕\n'.repeat(7_000);
    expect(junk.length).toBeGreaterThan(100_000);
    const t0 = performance.now();
    const d = parseRecipeText(junk);
    expect(performance.now() - t0).toBeLessThan(2_000);
    expect((d.title ?? '').length).toBeLessThanOrEqual(200);
  });

  it('keeps non-Latin titles, trimming only decorative emoji (TikTok style)', () => {
    const d = parseRecipeText(
      '🍜 拉面 Ramen maison 🔥\n\nIngrédients\n200 g nouilles\n\nÉtapes\nCuire.',
    );
    expect(d.title).toBe('拉面 Ramen maison');
    expect(d.ingredients[0]).toMatchObject({ quantity: 200, unit: 'g' });
  });

  it.each([
    '',
    '   ',
    '-',
    '•••',
    '1/0 g sucre',
    '0/0',
    '∞ kg de pommes',
    '-5 œufs',
    '999999999999 g sel',
  ])('ingredient line %j never throws and never yields a non-finite quantity', (line) => {
    const p = parseIngredientLine(line);
    if (p?.quantity != null) expect(Number.isFinite(p.quantity)).toBe(true);
  });

  it.each(['1/0', '0/0', 'abc', '½½', '1 ½ ½', '1e309'])(
    'quantity %j is rejected or finite',
    (q) => {
      const v = parseQuantity(q);
      if (v != null) expect(Number.isFinite(v)).toBe(true);
    },
  );

  it('formats extreme quantities without scientific notation garbage', () => {
    const f = (quantity: number) => formatAmount({ quantity, quantityMax: null, unit: 'g' }, 'fr');
    expect(f(0.0001)).not.toMatch(/e-/);
    expect(f(123456.789)).not.toMatch(/e\+/);
    expect(f(1e21)).not.toMatch(/e\+/);
  });

  it('search queries made of symbols or huge strings do not throw', () => {
    expect(() => parseSearchQuery('(((*+?[')).not.toThrow();
    expect(() => parseSearchQuery('poulet '.repeat(5_000))).not.toThrow();
    expect(() => parseSearchQuery('moins de -30 minutes')).not.toThrow();
  });
});
