import { describe, expect, it } from 'vitest';
import {
  categorizeIngredient as c,
  formatShoppingQuantity,
  groupByCategory,
  mergeShoppingLines,
  planMergeIntoList,
  shoppingLinesFromPlan,
} from './shopping';

describe('categorizeIngredient', () => {
  it.each([
    ['Tomates cerises', 'produce'],
    ['poivron rouge', 'produce'],
    ['poivre noir', 'condiments'],
    ['Poivre', 'condiments'],
    ['Pommes de terre', 'produce'],
    ['blanc de poulet', 'meat_fish'],
    ['Saumon frais', 'meat_fish'],
    ['Œufs', 'dairy_eggs'],
    ['crème fraîche épaisse', 'dairy_eggs'],
    ['lait de coco', 'pantry'],
    ['beurre de cacahuète', 'pantry'],
    ['beurre doux', 'dairy_eggs'],
    ['Pâtes', 'pantry'],
    ['pâte feuilletée', 'dairy_eggs'],
    ['farine T55', 'pantry'],
    ['sucre glace', 'sweets_breakfast'],
    ['jus d’orange', 'drinks'],
    ['vin blanc sec', 'drinks'],
    ['baguette', 'bakery'],
    ['papier cuisson', 'household'],
    ['chicken breast', 'meat_fish'],
    ['Hähnchen', 'meat_fish'],
    ['cipolla', 'produce'],
    ['queso', 'dairy_eggs'],
    ['glace vanille', 'frozen'],
    ['Bidule inconnu', 'other'],
    ['', 'other'],
  ])('%s → %s', (name, cat) => expect(c(name)).toBe(cat));
});

describe('merging', () => {
  it('merges same ingredient across units and normalises', () => {
    const m = mergeShoppingLines([
      { name: 'Farine', quantity: 600, unit: 'g', recipeIds: ['a'] },
      { name: 'farine', quantity: 0.5, unit: 'kg', recipeIds: ['b'] },
      { name: 'Œufs', quantity: 2, unit: null, recipeIds: ['a'] },
      { name: 'oeuf', quantity: 3, unit: null, recipeIds: ['b'] },
      { name: 'oeuf', quantity: 1, unit: 'piece', recipeIds: ['c'] },
    ]);
    expect(m).toHaveLength(3);
    expect(m[0]).toMatchObject({ quantity: 1.1, unit: 'kg', recipeIds: ['a', 'b'] });
    expect(m[1]).toMatchObject({ quantity: 5, unit: null });
  });
  it('scales planned meals by servings (legacy parseFloat("1/2") bug fixed)', () => {
    const lines = shoppingLinesFromPlan(
      [
        {
          recipeId: 'r1',
          recipeServings: 2,
          plannedServings: 4,
          ingredients: [
            { name: 'farine', quantity: 250, quantityMax: null, unit: 'g' },
            { name: 'sel', quantity: null, quantityMax: null, unit: null },
          ],
        },
        {
          recipeId: 'r2',
          recipeServings: 4,
          plannedServings: null,
          ingredients: [
            { name: 'farine', quantity: 0.5, quantityMax: null, unit: 'kg' },
            { name: 'citron', quantity: 0.5, quantityMax: null, unit: null },
          ],
        },
      ],
      4,
    );
    expect(lines.find((l) => l.name === 'farine')).toMatchObject({ quantity: 1, unit: 'kg' });
    expect(lines.find((l) => l.name === 'citron')!.quantity).toBe(0.5);
    expect(lines.find((l) => l.name === 'sel')!.quantity).toBeNull();
  });
  it('merges into an existing list without touching checked items', () => {
    const plan = planMergeIntoList(
      [
        {
          id: '1',
          name: 'Farine',
          quantity: 200,
          unit: 'g',
          categoryKey: 'pantry',
          checked: false,
          recipeIds: [],
        },
        {
          id: '2',
          name: 'Lait',
          quantity: 1,
          unit: 'l',
          categoryKey: 'dairy_eggs',
          checked: true,
          recipeIds: [],
        },
      ],
      [
        { name: 'farine', quantity: 300, unit: 'g', recipeIds: ['r'] },
        { name: 'lait', quantity: 50, unit: 'cl', recipeIds: ['r'] },
      ],
    );
    expect(plan[0]).toEqual({
      kind: 'update',
      id: '1',
      quantity: 500,
      unit: 'g',
      recipeIds: ['r'],
    });
    expect(plan[1]).toMatchObject({ kind: 'insert', categoryKey: 'dairy_eggs' });
  });
  it('formats and groups', () => {
    expect(formatShoppingQuantity({ quantity: 2, unit: 'clove' }, 'fr')).toBe('2 gousses');
    expect(formatShoppingQuantity({ quantity: 1.5, unit: 'kg' }, 'fr')).toBe('1,5 kg');
    expect(formatShoppingQuantity({ quantity: null, unit: null }, 'fr')).toBe('');
    const g = groupByCategory(
      [
        { categoryKey: 'pantry', checked: true, position: 0 },
        { categoryKey: 'produce', checked: false, position: 2 },
        { categoryKey: 'pantry', checked: false, position: 1 },
        { categoryKey: 'custom-x', checked: false, position: 0 },
      ],
      ['produce', 'pantry'],
    );
    expect(g.map((x) => x.key)).toEqual(['produce', 'pantry', 'custom-x']);
    expect(g[1]!.items.map((i) => i.checked)).toEqual([false, true]);
  });
});
