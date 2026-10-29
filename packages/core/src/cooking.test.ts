import { describe, expect, it } from 'vitest';
import {
  convertUnits,
  cupsToGrams,
  densityOf,
  findMoldSize,
  roundForCooking,
  scaleMold,
  scaleStepText,
} from './cooking';

const amt = (quantity: number, unit: string | null = null) => ({
  quantity,
  quantityMax: null,
  unit,
});

describe('smart scaling', () => {
  it('whole eggs, halves of vegetables, quarters of spoons', () => {
    expect(roundForCooking(amt(1.33), 'œufs')).toMatchObject({ quantity: 1, changed: true });
    expect(roundForCooking(amt(0.4), 'oeuf')).toMatchObject({ quantity: 1 });
    expect(roundForCooking(amt(2.67), 'eggs')).toMatchObject({ quantity: 3 });
    expect(roundForCooking(amt(1.33), 'oignon')).toMatchObject({ quantity: 1.5 });
    expect(roundForCooking(amt(6.6), 'tomates')).toMatchObject({ quantity: 7 });
    expect(roundForCooking(amt(0.66, 'tbsp'), 'huile')).toMatchObject({ quantity: 0.75 });
    expect(roundForCooking(amt(266.7, 'g'), 'farine')).toMatchObject({
      quantity: 266.7,
      changed: false,
    });
  });
});

describe('baking tins', () => {
  it('finds the tin in the recipe', () => {
    expect(findMoldSize(['Beurrez un moule de 24 cm.'])).toEqual({ shape: 'round', diameter: 24 });
    expect(findMoldSize(['Versez dans un plat de 20 x 30 cm'])).toEqual({
      shape: 'rect',
      width: 20,
      length: 30,
    });
    expect(findMoldSize(['Grease a 9-inch springform pan'])).toEqual({
      shape: 'round',
      diameter: 23,
    });
    expect(findMoldSize(['Cercle Ø 22 cm'])).toEqual({ shape: 'round', diameter: 22 });
    expect(findMoldSize(['Coupez en dés de 2 cm'])).toBeNull();
  });
  it('the area follows the quantities', () => {
    expect(scaleMold({ shape: 'round', diameter: 24 }, 2)).toEqual({
      shape: 'round',
      diameter: 34,
    });
    expect(scaleMold({ shape: 'round', diameter: 24 }, 1.5)).toEqual({
      shape: 'round',
      diameter: 30,
    });
    expect(scaleMold({ shape: 'round', diameter: 24 }, 0.5)).toEqual({
      shape: 'round',
      diameter: 16,
    });
    expect(scaleMold({ shape: 'round', diameter: 24 }, 1)).toBeNull();
    expect(scaleMold({ shape: 'rect', width: 20, length: 30 }, 2)).toEqual({
      shape: 'rect',
      width: 28,
      length: 42,
    });
  });
});

describe('quantities in steps', () => {
  it('scales weights and volumes only', () => {
    expect(scaleStepText('Ajoutez 200 g de farine et 2 c. à soupe de sucre.', 1.5, 'fr')).toBe(
      'Ajoutez 300 g de farine et 3 c. à soupe de sucre.',
    );
    expect(scaleStepText('Cuire 20 min à 180 °C dans un moule de 24 cm.', 2, 'fr')).toBe(
      'Cuire 20 min à 180 °C dans un moule de 24 cm.',
    );
    expect(scaleStepText('Versez 50 cl de lait puis 1 cuillère à café de sel', 0.5, 'fr')).toBe(
      'Versez 25 cl de lait puis ½ cuillère à café de sel',
    );
    expect(scaleStepText('Add 1 cup flour and 2-3 tbsp milk', 2, 'en')).toBe(
      'Add 2 cup flour and 4-6 tbsp milk',
    );
    expect(scaleStepText('Mélangez 2 œufs', 2, 'fr')).toBe('Mélangez 2 œufs');
  });
});

describe('converter', () => {
  it('same dimension', () => {
    expect(convertUnits(1, 'kg', 'g')).toBe(1000);
    expect(convertUnits(1, 'cup', 'ml')).toBe(240);
    expect(convertUnits(16, 'oz', 'lb')).toBeCloseTo(1, 2);
  });
  it('weight ↔ volume needs a density', () => {
    expect(convertUnits(1, 'cup', 'g')).toBeNull();
    expect(convertUnits(1, 'cup', 'g', densityOf('Farine T55')!.gPerMl)).toBeCloseTo(127.2, 1);
    expect(convertUnits(100, 'g', 'ml', 1)).toBe(100);
  });
  it('cups of flour shown in grams', () => {
    expect(cupsToGrams(amt(2, 'cup'), 'all-purpose flour')).toMatchObject({ unit: 'g' });
    expect(cupsToGrams(amt(2, 'cup'), 'milk')).toMatchObject({ unit: 'cup' });
    expect(cupsToGrams(amt(200, 'g'), 'flour')).toMatchObject({ unit: 'g', quantity: 200 });
  });
});
