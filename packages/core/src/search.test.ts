import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  isActiveSearch,
  parseSearchQuery,
  searchRecipes,
  type SearchableRecipe,
} from './search';

let n = 0;
const R = (p: Partial<SearchableRecipe>): SearchableRecipe => ({
  id: String(++n),
  title: 'x',
  description: null,
  category: null,
  tags: [],
  difficulty: null,
  seasons: [],
  totalMinutes: null,
  ingredientNames: [],
  updatedAt: `2026-01-${String(n).padStart(2, '0')}`,
  ...p,
});

const data = [
  R({
    title: 'Poulet rôti au citron',
    category: 'meat',
    totalMinutes: 75,
    ingredientNames: ['poulet', 'citron', 'thym'],
    difficulty: 'easy',
  }),
  R({
    title: 'Wok de poulet express',
    category: 'meat',
    totalMinutes: 20,
    ingredientNames: ['blanc de poulet', 'poivron', 'sauce soja'],
    tags: ['asiatique'],
  }),
  R({
    title: 'Spaghetti carbonara',
    category: 'pasta',
    totalMinutes: 25,
    ingredientNames: ['spaghetti', 'guanciale', 'œufs', 'pecorino'],
  }),
  R({
    title: 'Risotto aux champignons',
    category: 'main',
    totalMinutes: 40,
    ingredientNames: ['riz arborio', 'champignons', 'parmesan'],
  }),
  R({
    title: 'Gaspacho',
    category: 'soup',
    totalMinutes: 15,
    seasons: ['summer'],
    ingredientNames: ['tomates', 'concombre', 'poivron'],
  }),
  R({
    title: 'Soupe de potiron',
    category: 'soup',
    totalMinutes: 45,
    seasons: ['autumn', 'winter'],
    ingredientNames: ['potiron', 'oignon', 'crème'],
  }),
  R({
    title: 'Fondant au chocolat',
    category: 'dessert',
    totalMinutes: 30,
    difficulty: 'easy',
    ingredientNames: ['chocolat noir', 'beurre', 'sucre', 'œufs', 'farine'],
  }),
];

const ids = (q: string, f = EMPTY_FILTERS) =>
  searchRecipes(data, q, f, new Date('2026-07-10')).map((r) => r.recipe.title);

describe('parseSearchQuery', () => {
  it('understands "poulet rapide"', () => {
    expect(parseSearchQuery('poulet rapide')).toMatchObject({ terms: ['poulet'], maxMinutes: 30 });
  });
  it('understands "italien moins de 30 minutes"', () => {
    expect(parseSearchQuery('italien moins de 30 minutes')).toMatchObject({
      terms: [],
      maxMinutes: 30,
      cuisines: ['italian'],
    });
  });
  it('understands exclusions, difficulty, seasons, categories in several languages', () => {
    expect(parseSearchQuery('dessert facile sans gluten')).toMatchObject({
      categories: ['dessert'],
      difficulty: 'easy',
      excluded: ['gluten'],
    });
    expect(parseSearchQuery('summer salad under 1 hour')).toMatchObject({
      seasons: ['summer'],
      categories: ['salad'],
      maxMinutes: 60,
    });
    expect(parseSearchQuery('schnelle Suppe')).toMatchObject({
      categories: ['soup'],
      maxMinutes: 30,
    });
    expect(parseSearchQuery('recette de saison', new Date('2026-10-01')).seasons).toEqual([
      'autumn',
    ]);
  });
});

describe('searchRecipes', () => {
  it('"poulet rapide" finds the quick chicken only', () => {
    expect(ids('poulet rapide')).toEqual(['Wok de poulet express']);
  });
  it('"italien moins de 30 minutes" → carbonara', () => {
    expect(ids('italien moins de 30 minutes')).toEqual(['Spaghetti carbonara']);
  });
  it('matches ingredients, prefixes, accents and plurals', () => {
    expect(ids('champignon')).toEqual(['Risotto aux champignons']);
    expect(ids('oeuf').sort()).toEqual(['Fondant au chocolat', 'Spaghetti carbonara']);
    expect(ids('choco')).toEqual(['Fondant au chocolat']);
    expect(ids('POIVRONS').sort()).toEqual(['Gaspacho', 'Wok de poulet express']);
  });
  it('title matches rank above ingredient matches', () => {
    expect(ids('poulet')[0]).toMatch(/poulet/i);
  });
  it('filters by category / season / difficulty / time / exclusion', () => {
    expect(ids('', { ...EMPTY_FILTERS, categories: ['soup'] }).sort()).toEqual([
      'Gaspacho',
      'Soupe de potiron',
    ]);
    expect(ids('soupe hiver')).toEqual(['Soupe de potiron']);
    expect(ids('', { ...EMPTY_FILTERS, difficulty: 'easy', maxMinutes: 30 })).toEqual([
      'Fondant au chocolat',
    ]);
    expect(ids('poulet sans citron')).toEqual(['Wok de poulet express']);
  });
  it('fridge search ranks by coverage and reports missing ingredients', () => {
    const r = searchRecipes(data, '', {
      ...EMPTY_FILTERS,
      fridge: ['tomate', 'concombre', 'poivron'],
    });
    expect(r[0]!.recipe.title).toBe('Gaspacho');
    expect(r[0]!.missing).toEqual([]);
    expect(r.find((x) => x.recipe.title.startsWith('Wok'))!.missing).toEqual([
      'blanc de poulet',
      'sauce soja',
    ]);
  });
  it('nothing found is an empty list, never a crash', () => {
    expect(ids('zzzzqqq')).toEqual([]);
    expect(ids('%_\\\'"; DROP TABLE')).toEqual([]);
    expect(searchRecipes([], 'poulet')).toEqual([]);
  });
  it('isActiveSearch', () => {
    expect(isActiveSearch('', EMPTY_FILTERS)).toBe(false);
    expect(isActiveSearch(' a', EMPTY_FILTERS)).toBe(true);
  });
});
