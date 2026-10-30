import { describe, expect, it } from 'vitest';
import { ingredientsFromScreenText, mergeIngredients } from './onscreen';

describe('text written on a recipe video', () => {
  it('keeps ingredient lines once, in order, and drops the rest', () => {
    const frames = [
      ['PÂTES AU CITRON', '@chef.lea'],
      ['400 g de spaghetti', '2 citrons'],
      ['400 g de spaghetti', '2 citrons', '20 cl de crème'],
      ['Cuire 8 min', '8 min', '180°C', 'Abonne-toi pour plus de recettes', '#recette'],
      ['60g parmesan', '2 citrons'],
    ];
    const ings = ingredientsFromScreenText(frames);
    expect(ings.map((i) => [i.quantity, i.unit, i.name])).toEqual([
      [400, 'g', 'spaghetti'],
      [2, null, 'citrons'],
      [20, 'cl', 'crème'],
      [60, 'g', 'parmesan'],
    ]);
  });

  it('merges without duplicates and fills missing quantities', () => {
    const base = [
      { group: null, name: 'citrons', quantity: null, quantityMax: null, unit: null, note: null },
      { group: null, name: 'ail', quantity: 1, quantityMax: null, unit: 'gousse', note: null },
    ];
    const extra = ingredientsFromScreenText([['2 citrons', '1 gousse d’ail', '50 g de beurre']]);
    const merged = mergeIngredients(base, extra);
    expect(merged.map((i) => [i.quantity, i.name])).toEqual([
      [2, 'citrons'],
      [1, 'ail'],
      [50, 'beurre'],
    ]);
    expect(base[0]!.quantity).toBeNull();
  });
});
