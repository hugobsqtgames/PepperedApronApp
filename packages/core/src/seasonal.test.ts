import { describe, expect, it } from 'vitest';
import { detectSeasons, ingredientSeasons, recipeSeasons } from './seasonal';

describe('seasonal produce', () => {
  it('reads the season of produce, longest name first', () => {
    expect(ingredientSeasons('1 potimarron')).toEqual(['autumn', 'winter']);
    expect(ingredientSeasons('Pommes de terre')).toBeNull();
    expect(ingredientSeasons('pommes')).toEqual(['autumn', 'winter']);
    expect(ingredientSeasons('concentré de tomate')).toBeNull();
    expect(ingredientSeasons('Tomates')).toEqual(['summer']);
    expect(ingredientSeasons('sel')).toBeNull();
  });
  it('a recipe is in season when all its seasonal produce is', () => {
    expect(detectSeasons(['courgettes', 'tomates', 'basilic'])).toEqual(['summer']);
    expect(detectSeasons(['poireaux', 'pommes de terre', 'crème'])).toEqual(['autumn', 'winter']);
    expect(detectSeasons(['tomates', 'potiron'])).toEqual([]);
    expect(detectSeasons(['pâtes', 'parmesan'])).toEqual([]);
  });
  it('the seasons chosen by the user win', () => {
    expect(recipeSeasons({ seasons: ['spring'], ingredients: [{ name: 'tomate' }] })).toEqual([
      'spring',
    ]);
    expect(recipeSeasons({ seasons: [], ingredients: [{ name: 'asperges vertes' }] })).toEqual([
      'spring',
    ]);
  });
});
