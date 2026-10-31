import { describe, expect, it } from 'vitest';
import { equipmentMatches, parseEquipmentQuery, recipeEquipment } from './equipment';
import { EMPTY_FILTERS, searchRecipes, type SearchableRecipe } from './search';

const r = (title: string, ...steps: string[]) => ({
  title,
  steps: steps.map((text) => ({ text })),
});

describe('equipment', () => {
  it('is read from the steps', () => {
    expect(recipeEquipment(r('Gratin', 'Enfourner 40 min à 200 °C.'))).toEqual(['oven']);
    expect(recipeEquipment(r('Poulet', 'Faire dorer dans une poêle.'))).toContain('stovetop');
    expect(recipeEquipment(r('Frites', 'Cuire 15 min au air fryer à 200 °C.'))).toEqual([
      'airfryer',
    ]);
    expect(recipeEquipment(r('Risotto', 'Cuire 6 min au Cookeo sous pression.'))).toEqual([
      'pressureCooker',
    ]);
    expect(recipeEquipment(r('Taboulé', 'Mélanger la semoule, les tomates et la menthe.'))).toEqual(
      ['noCook'],
    );
    expect(recipeEquipment(r('Velouté', 'Mixer au blender.', 'Faire bouillir 20 min.'))).toEqual([
      'stovetop',
      'blender',
    ]);
    expect(
      recipeEquipment({ ...r('Cake', 'Verser dans le moule.'), ovenTemperatureC: 180 }),
    ).toEqual(['oven']);
  });

  it('is understood in a search', () => {
    expect(parseEquipmentQuery('gratin sans four')).toEqual({
      equipment: [],
      without: ['oven'],
      rest: 'gratin',
    });
    expect(parseEquipmentQuery('poulet airfryer')).toMatchObject({
      equipment: ['airfryer'],
      rest: 'poulet',
    });
    expect(parseEquipmentQuery('dessert sans cuisson').equipment).toEqual(['noCook']);
    expect(parseEquipmentQuery('poulet au curry')).toEqual({
      equipment: [],
      without: [],
      rest: 'poulet au curry',
    });
    expect(equipmentMatches(['stovetop'], [], ['oven'])).toBe(true);
    expect(equipmentMatches(['oven'], [], ['oven'])).toBe(false);
  });

  it('filters the search results', () => {
    const base: Omit<SearchableRecipe, 'id' | 'title' | 'equipment'> = {
      description: null,
      category: null,
      tags: [],
      difficulty: null,
      seasons: [],
      totalMinutes: 20,
      ingredientNames: ['poulet'],
      updatedAt: '2026-01-01',
    };
    const list: SearchableRecipe[] = [
      { ...base, id: 'a', title: 'Poulet rôti', equipment: ['oven'] },
      { ...base, id: 'b', title: 'Poulet sauté', equipment: ['stovetop'] },
      { ...base, id: 'c', title: 'Poulet croustillant', equipment: ['airfryer'] },
    ];
    expect(
      searchRecipes(list, 'poulet sans four')
        .map((x) => x.recipe.id)
        .sort(),
    ).toEqual(['b', 'c']);
    expect(searchRecipes(list, 'poulet airfryer').map((x) => x.recipe.id)).toEqual(['c']);
    expect(
      searchRecipes(list, '', { ...EMPTY_FILTERS, withoutEquipment: ['oven', 'airfryer'] }).map(
        (x) => x.recipe.id,
      ),
    ).toEqual(['b']);
  });
});
