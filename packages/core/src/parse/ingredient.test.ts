import { describe, expect, it } from 'vitest';
import { parseIngredientLine as p } from './ingredient';

describe('parseIngredientLine', () => {
  it.each([
    ['200 g de farine', { quantity: 200, unit: 'g', name: 'farine' }],
    ['250g de beurre mou', { quantity: 250, unit: 'g', name: 'beurre mou' }],
    ['2 oeufs', { quantity: 2, unit: null, name: 'oeufs' }],
    ["1 c. à soupe d'huile d'olive", { quantity: 1, unit: 'tbsp', name: "huile d'olive" }],
    ['½ cuillère à café de sel', { quantity: 0.5, unit: 'tsp', name: 'sel' }],
    ['3 gousses d’ail', { quantity: 3, unit: 'clove', name: 'ail' }],
    ['1 1/2 cups flour, sifted', { quantity: 1.5, unit: 'cup', name: 'flour', note: 'sifted' }],
    ['2 tbsp olive oil', { quantity: 2, unit: 'tbsp', name: 'olive oil' }],
    ['400 ml de lait de coco', { quantity: 400, unit: 'ml', name: 'lait de coco' }],
    [
      '1 kg de pommes de terre (à chair ferme)',
      { quantity: 1, unit: 'kg', name: 'pommes de terre', note: 'à chair ferme' },
    ],
    ['- 2 tomates', { quantity: 2, unit: null, name: 'tomates' }],
    ['• 1 pincée de sel', { quantity: 1, unit: 'pinch', name: 'sel' }],
    ['une pincée de muscade', { quantity: 1, unit: 'pinch', name: 'muscade' }],
    ['2 EL Olivenöl', { quantity: 2, unit: 'tbsp', name: 'Olivenöl' }],
    ['200 g Mehl', { quantity: 200, unit: 'g', name: 'Mehl' }],
    ['2 cucharadas de aceite', { quantity: 2, unit: 'tbsp', name: 'aceite' }],
    ['100 g di zucchero', { quantity: 100, unit: 'g', name: 'zucchero' }],
    ['1 boîte de tomates concassées', { quantity: 1, unit: 'can', name: 'tomates concassées' }],
    ['Farine : 200 g', { quantity: 200, unit: 'g', name: 'Farine' }],
    ['2 limes', { quantity: 2, unit: null, name: 'limes' }],
    ['2 litres d’eau', { quantity: 2, unit: 'l', name: 'eau' }],
    ['10 cl de crème', { quantity: 10, unit: 'cl', name: 'crème' }],
  ])('%s', (line, expected) => {
    expect(p(line)).toMatchObject(expected);
  });
  it('ranges', () => {
    expect(p('3-4 pommes de terre')).toMatchObject({
      quantity: 3,
      quantityMax: 4,
      name: 'pommes de terre',
    });
    expect(p('2 à 3 carottes')).toMatchObject({ quantity: 2, quantityMax: 3, name: 'carottes' });
  });
  it('lines without quantity keep the full text', () => {
    expect(p('Sel, poivre')).toMatchObject({ quantity: null, unit: null, name: 'Sel, poivre' });
    expect(p('Quelques feuilles de basilic')).toMatchObject({
      quantity: null,
      name: 'Quelques feuilles de basilic',
    });
  });
  it('absurd input never throws', () => {
    for (const s of [
      '',
      '   ',
      '0 g',
      '1/0 g de sucre',
      '9999999999 kg',
      '((((',
      '🍅🍅',
      'g',
      '-',
      '1.2.3 kg',
      'x'.repeat(5000),
    ]) {
      expect(() => p(s)).not.toThrow();
    }
    expect(p('')).toBeNull();
    expect(p('0 g de sucre')?.quantity).toBeNull();
  });
});

describe('round trip with localized unit labels', () => {
  it.each([
    ['2 c. à soupe huile', 'fr'],
    ['1 c. à café sel', 'fr'],
    ['2 cdas aceite', 'es'],
    ['3 EL Öl', 'de'],
    ['2 cucchiai olio', 'it'],
    ['2 gousses ail', 'fr'],
    ['1 Päckchen Hefe', 'de'],
  ])('%s', (line) => {
    const p0 = p(line)!;
    expect(p0.unit).not.toBeNull();
  });
});
