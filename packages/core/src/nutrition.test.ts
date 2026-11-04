import { describe, expect, it } from 'vitest';
import {
  estimateCalories,
  findFood,
  ingredientCalories,
  isNutritionLine,
  parseNutritionFacts,
} from './nutrition';

const ing = (name: string, quantity: number | null, unit: string | null = null) => ({
  name,
  quantity,
  quantityMax: null,
  unit,
});

describe('calories', () => {
  it('reads grams, pieces, spoons and cans', () => {
    expect(ingredientCalories(ing('farine', 200, 'g'))).toBe(700);
    expect(ingredientCalories(ing('Œufs', 3))).toBeCloseTo(217.5);
    expect(ingredientCalories(ing("huile d'olive", 2, 'tbsp'))).toBeCloseTo(248.4);
    expect(ingredientCalories(ing('beurre', 0.1, 'kg'))).toBe(745);
    expect(ingredientCalories(ing('lait', 25, 'cl'))).toBeCloseTo(118.45);
    // Canned chickpeas are cooked: not counted as dry ones.
    expect(ingredientCalories(ing('pois chiches', 1, 'can'))).toBe(480);
    expect(ingredientCalories(ing('ail', 2, 'clove'))).toBe(13);
  });

  it('takes the most precise name', () => {
    expect(findFood('lait de coco')?.kcal).toBe(190);
    expect(findFood('beurre de cacahuète')?.kcal).toBe(600);
    expect(findFood('pommes de terre')?.kcal).toBe(80);
    expect(findFood('sucre glace')?.kcal).toBe(400);
    expect(findFood('jaune d’œuf')?.kcal).toBe(320);
    expect(findFood('poivron jaune')?.kcal).toBe(30);
    expect(findFood('noix de coco râpée')?.kcal).toBe(650);
  });

  it('salt, water and herbs count for nothing, even without a quantity', () => {
    for (const n of ['sel', 'poivre', "verre d'eau", 'persil haché', 'cumin', 'salt and pepper'])
      expect(ingredientCalories(ing(n, null))).toBe(0);
  });

  it('reads the yogurt pot and tells peppers from pepper', () => {
    expect(ingredientCalories(ing('pots de farine', 3))).toBeCloseTo(721.875);
    expect(ingredientCalories(ing("pot d'huile", 0.5))).toBeCloseTo(517.5);
    expect(ingredientCalories(ing('peppers', 2))).toBe(90);
    expect(ingredientCalories(ing('pepper', 1, 'pinch'))).toBe(0);
    expect(ingredientCalories(ing('pepper', null))).toBe(0);
  });

  it('cannot tell an unknown food or a missing quantity', () => {
    expect(ingredientCalories(ing('ingrédient mystère', 100, 'g'))).toBeNull();
    expect(ingredientCalories(ing('farine', null))).toBeNull();
    expect(ingredientCalories(ing('farine', 2, 'poignées de lune'))).toBeNull();
  });

  it('gives a per serving figure for a crêpe batter', () => {
    const e = estimateCalories({
      servings: 4,
      ingredients: [
        ing('farine', 250, 'g'),
        ing('œufs', 4),
        ing('lait', 500, 'ml'),
        ing('beurre fondu', 50, 'g'),
        ing('sucre', 2, 'tbsp'),
        ing('sel', 1, 'pinch'),
      ],
    });
    // 875 + 290 + 257.5 + 372.5 + 102 = 1897 kcal → ~470 per serving.
    expect(e?.perServing).toBe(470);
    expect(e?.missing).toEqual([]);
    expect(e?.coverage).toBe(1);
  });

  it('says nothing rather than a wrong number when too much is unknown', () => {
    expect(
      estimateCalories({
        servings: 2,
        ingredients: [ing('farine', 100, 'g'), ing('truc', 1), ing('machin', 2, 'g')],
      }),
    ).toBeNull();
    // One unknown out of four: shown, with the unknown listed.
    const e = estimateCalories({
      servings: 2,
      ingredients: [
        ing('riz', 200, 'g'),
        ing('poulet', 300, 'g'),
        ing('oignon', 1),
        ing('truc', 1),
      ],
    });
    expect(e?.missing).toEqual(['truc']);
    expect(estimateCalories({ servings: 2, ingredients: [ing('sel', null)] })).toBeNull();
  });
});

describe('nutrition facts given by a recipe', () => {
  it('reads the table at the end of an imported recipe (feedback)', () => {
    const f = parseNutritionFacts(
      'CALORIES 1918 | PROTÉINES : 42g | MG: 26g | ACIDES GRAS SATURÉS 430 | CICIDES : 120g | SUCRE: 14g | SEL:1,29 [ FIBRES 16(',
    );
    expect(f).toMatchObject({
      kcal: 1918,
      protein: 42,
      fat: 26,
      sugars: 14,
      salt: 1.29,
      fiber: 16,
    });
    expect(
      parseNutritionFacts('Per serving: 450 kcal, protein 20 g, fat 12 g, carbs 60 g'),
    ).toMatchObject({ kcal: 450, protein: 20, fat: 12, carbs: 60 });
  });

  it('a cooking step is never taken for a nutrition table', () => {
    for (const step of [
      'Mélanger 200 g de sucre, 1 pincée de sel et 50 g de beurre.',
      'Ajouter le sel, le sucre et les protéines de pois, cuire 10 min.',
      'Cuire 45 min à 180 °C, saler et poivrer.',
      'Add salt, sugar and 2 tbsp of fat, then bake 20 minutes.',
    ])
      expect(isNutritionLine(step)).toBe(false);
  });

  it('lists what each ingredient brings, the biggest first', () => {
    const e = estimateCalories({
      servings: 4,
      ingredients: [ing('sachet gnocchis', 1, 'packet'), ing('chorizo', 1), ing('oignon', 1)],
    });
    expect(e?.lines.map((l) => l.name)).toEqual(['chorizo', 'sachet gnocchis', 'oignon']);
    expect(e?.perServing).toBe(450);
  });
});
