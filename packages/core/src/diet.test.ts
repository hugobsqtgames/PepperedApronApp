import { describe, expect, it } from 'vitest';
import { containsGluten, dietTags, isAnimalProduct, isMeatOrFish } from './diet';

describe('diet labels', () => {
  it('spots meat, fish and seafood in French and English', () => {
    for (const n of [
      'Blancs de poulet',
      'lardons fumés',
      'Filet de saumon',
      'crevettes',
      'beef mince',
      'anchovies',
      'feuilles de gélatine',
    ])
      expect(isMeatOrFish(n)).toBe(true);
    for (const n of [
      'Poivron jaune',
      'lait de coco',
      'steak végétal',
      'pommes de terre',
      'tofu fumé',
    ])
      expect(isMeatOrFish(n)).toBe(false);
  });
  it('plant milks and butters are not animal products', () => {
    expect(isAnimalProduct('Beurre')).toBe(true);
    expect(isAnimalProduct("2 jaunes d'œufs")).toBe(true);
    expect(isAnimalProduct('Crème fraîche épaisse')).toBe(true);
    expect(isAnimalProduct('lait de coco')).toBe(false);
    expect(isAnimalProduct('beurre de cacahuète')).toBe(false);
    expect(isAnimalProduct('crème de marrons')).toBe(false);
    expect(isAnimalProduct('poivron jaune')).toBe(false);
  });
  it('gluten: wheat products yes, rice noodles and curry paste no', () => {
    for (const n of [
      'Farine T55',
      'pâte feuilletée',
      'spaghetti',
      'chapelure',
      'sauce soja',
      'plain flour',
    ])
      expect(containsGluten(n)).toBe(true);
    for (const n of [
      'farine de riz',
      'nouilles de riz',
      'pâte de curry rouge',
      'fécule de maïs',
      'tamari',
      'pommes de terre',
    ])
      expect(containsGluten(n)).toBe(false);
  });
  it('labels a whole recipe', () => {
    expect(dietTags(['Pommes de terre', 'Huile d’olive', 'Sel'])).toEqual([
      'vegetarian',
      'vegan',
      'glutenFree',
    ]);
    expect(dietTags(['Farine', 'Œufs', 'Lait'])).toEqual(['vegetarian']);
    expect(dietTags(['Poulet', 'Riz', 'Lait de coco'])).toEqual(['glutenFree']);
    expect(dietTags([])).toEqual([]);
  });
});
