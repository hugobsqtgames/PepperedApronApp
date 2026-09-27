import type { Ingredient } from '@pepperedapron/core';
import { formatIngredient, formatOven, recipeAsText } from '../src/lib/format';

const butter: Ingredient = {
  id: 'b',
  group: null,
  name: 'beurre',
  quantity: 250,
  quantityMax: null,
  unit: 'g',
  note: null,
};

describe('format', () => {
  it('scales and normalizes quantities', () => {
    expect(formatIngredient(butter, 4, 'fr', 'metric').amount).toBe('1 kg');
  });

  it('converts to imperial on demand', () => {
    expect(formatIngredient(butter, 1, 'en', 'imperial').amount).toMatch(/oz|lb/);
    expect(formatOven(180, 'imperial')).toBe('355 °F'); // rounded to oven-dial steps;
    expect(formatOven(180, 'metric')).toBe('180 °C');
  });

  it('builds a shareable plain-text recipe', () => {
    const text = recipeAsText(
      {
        title: 'Quatre-quarts',
        description: null,
        servings: 6,
        ingredients: [butter],
        steps: [{ text: 'Mélanger.', group: null }],
        tips: null,
        sourceUrl: 'https://example.com/r',
      },
      { ingredients: 'Ingrédients', steps: 'Étapes', tips: 'Astuces', servings: '6 personnes' },
      'fr',
      'metric',
    );
    expect(text).toContain('Quatre-quarts');
    expect(text).toContain('• 250 g beurre');
    expect(text).toContain('1. Mélanger.');
    expect(text.trim().endsWith('https://example.com/r')).toBe(true);
  });
});
