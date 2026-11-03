import { describe, expect, it } from 'vitest';
import { isTapWater, shoppingLinesFromPlan } from './shopping';
import { parseIngredientLine } from './parse/ingredient';

/** Feedback after release: "un verre d'eau" ended on the shopping list and in the pantry. */
describe('tap water is never bought', () => {
  it.each([
    'eau',
    'Eau',
    'eau tiède',
    'eau froide',
    'eau bouillante',
    'eau du robinet',
    'un verre d’eau',
    "verre d'eau",
    "1 verre d'eau",
    "un peu d'eau",
    "filet d'eau",
    'water',
    'warm water',
    'boiling water',
  ])('%s is tap water', (n) => expect(isTapWater(n)).toBe(true));

  it.each([
    'eau gazeuse',
    'eau de coco',
    'eau de fleur d’oranger',
    'eau-de-vie',
    'eau de rose',
    'sparkling water',
    'coconut water',
    'pâtes',
    'gâteau',
    'veau',
  ])('%s is bought', (n) => expect(isTapWater(n)).toBe(false));

  it('a recipe with a glass of water: the water is not on the list', () => {
    const ingredients = [
      '200 g de farine',
      "1 verre d'eau",
      '20 cl d’eau tiède',
      '1 bouteille d’eau gazeuse',
    ].map((l, i) => ({ id: String(i), group: null, ...parseIngredientLine(l)! }));
    const lines = shoppingLinesFromPlan(
      [{ recipeId: 'r', recipeServings: 4, plannedServings: 4, ingredients }],
      4,
    );
    expect(lines.map((l) => l.name.toLowerCase())).toEqual(
      expect.arrayContaining(['farine', expect.stringContaining('gazeuse')]),
    );
    expect(lines.some((l) => /^eau$|eau ti/i.test(l.name))).toBe(false);
    expect(lines).toHaveLength(2);
  });
});
