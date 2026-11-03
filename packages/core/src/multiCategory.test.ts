import { describe, expect, it } from 'vitest';
import { recipeCategories, toggleCategory, userTags } from './category';
import { EMPTY_FILTERS, searchRecipes, type SearchableRecipe } from './search';
import { EMPTY_SMART_RULES, matchesSmartRules } from './smart';

/** Feedback: a recipe could only be in one category ("Gratin de pâtes": pasta AND main dish). */
describe('several categories per recipe', () => {
  it('toggling adds and removes categories, the first stays the main one', () => {
    let r = { category: null as 'pasta' | 'main' | 'side' | null, tags: ['famille'] };
    r = toggleCategory(r, 'pasta') as typeof r;
    r = toggleCategory(r, 'main') as typeof r;
    r = toggleCategory(r, 'side') as typeof r;
    expect(r.category).toBe('pasta');
    expect(recipeCategories(r)).toEqual(['pasta', 'main', 'side']);
    expect(userTags(r.tags)).toEqual(['famille']);
    // Removing the main one: the next becomes the main one.
    r = toggleCategory(r, 'pasta') as typeof r;
    expect(r.category).toBe('main');
    expect(recipeCategories(r)).toEqual(['main', 'side']);
    r = toggleCategory(toggleCategory(r, 'main'), 'side') as typeof r;
    expect(r).toEqual({ category: null, tags: ['famille'] });
  });

  it('a recipe is found under each of its categories', () => {
    const gratin: SearchableRecipe = {
      id: 'g',
      title: 'Gratin de pâtes',
      description: null,
      category: 'pasta',
      tags: ['main'],
      difficulty: null,
      seasons: [],
      totalMinutes: 40,
      ingredientNames: ['pâtes', 'fromage'],
      updatedAt: '2026-11-03T00:00:00Z',
    };
    const find = (c: 'pasta' | 'main' | 'dessert') =>
      searchRecipes([gratin], '', { ...EMPTY_FILTERS, categories: [c] }).length;
    expect(find('pasta')).toBe(1);
    expect(find('main')).toBe(1);
    expect(find('dessert')).toBe(0);
  });

  it('smart collections see the other categories too', () => {
    const base = {
      diets: [],
      totalMinutes: 40,
      category: 'pasta' as const,
      seasons: [],
      rating: null,
      lastCooked: null,
    };
    const rules = { ...EMPTY_SMART_RULES, categories: ['main' as const] };
    expect(matchesSmartRules(base, rules, '2026-11-03')).toBe(false);
    expect(matchesSmartRules({ ...base, extraCategories: ['main'] }, rules, '2026-11-03')).toBe(
      true,
    );
  });
});
