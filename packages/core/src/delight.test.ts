import { describe, expect, it } from 'vitest';
import {
  computeBadges,
  CUISINES,
  CUISINE_COUNTRY,
  detectCuisine,
  flagOf,
  leftoverIdeas,
  mealMoment,
  newlyWon,
  pairingsFor,
  parallelSteps,
  pickOfTheDay,
  recipeDataSchema,
  seasonalHighlights,
  seasonalProduce,
  yearReview,
  type CookedLike,
  type RecipeFacts,
} from './index';

const ing = (...names: string[]) => names.map((name) => ({ name }));

describe('cuisine of a recipe', () => {
  it.each([
    ['Risotto aux champignons', [], 'italian'],
    ['Pad thaï aux crevettes', [], 'thai'],
    ['Tajine de poulet aux citrons confits', [], 'maghreb'],
    ['Boeuf bourguignon', [], 'french'],
    ['Chicken tikka masala', [], 'indian'],
    ['Tacos al pastor', [], 'mexican'],
    ['Bibimbap', [], 'korean'],
    ['Pastéis de nata', [], 'portuguese'],
  ] as const)('%s → %s', (title, names, cuisine) => {
    expect(detectCuisine({ title, ingredients: ing(...names) })).toBe(cuisine);
  });

  it('from typical ingredients when the title says nothing', () => {
    expect(
      detectCuisine({
        title: 'Mon plat du dimanche',
        ingredients: ing('200 g de mozzarella', 'basilic frais', 'parmesan râpé', 'tomates'),
      }),
    ).toBe('italian');
    expect(
      detectCuisine({
        title: 'Bol du soir',
        ingredients: ing('sauce soja', 'gingembre', 'huile de sésame', 'riz'),
      }),
    ).toBe('chinese');
  });

  it('nothing when unclear (one clue, or a tie)', () => {
    expect(
      detectCuisine({ title: 'Salade composée', ingredients: ing('feta', 'tomate') }),
    ).toBeNull();
    expect(
      detectCuisine({
        title: 'Plat',
        ingredients: ing('parmesan', 'mozzarella', 'sauce soja', 'gingembre'),
      }),
    ).toBeNull();
  });

  it('tags count like the title; every cuisine has a country and a flag', () => {
    expect(detectCuisine({ title: 'Dîner', tags: ['japonais'], ingredients: [] })).toBe('japanese');
    for (const c of CUISINES) expect(flagOf(CUISINE_COUNTRY[c])).toHaveLength(4);
    expect(flagOf('FR')).toBe('🇫🇷');
  });
});

describe('pairings', () => {
  const p = (
    title: string,
    category: Parameters<typeof pairingsFor>[0]['category'],
    names: string[],
    cuisine: Parameters<typeof pairingsFor>[0]['cuisine'] = null,
  ) => pairingsFor({ title, category, cuisine, ingredients: ing(...names) });
  it('fish with white wine, stew with a full red, chocolate with coffee', () => {
    expect(p('Pavé de saumon', 'fish', ['saumon', 'citron'])).toMatchObject({ drink: 'whiteDry' });
    expect(p('Boeuf bourguignon', 'meat', ['boeuf', 'vin rouge'])).toMatchObject({
      drink: 'red_full',
      side: 'mash',
    });
    expect(p('Fondant', 'dessert', ['chocolat noir', 'beurre'])).toMatchObject({
      drink: null,
      soft: 'coffee',
    });
    expect(p('Curry de lentilles', 'main', ['lentille corail', 'curry'], 'indian')).toMatchObject({
      soft: 'lassi',
      side: 'rice',
    });
  });
  it('always an alcohol-free idea; no wine with breakfast', () => {
    expect(p('Pancakes', 'breakfast', ['farine', 'lait'])).toMatchObject({
      drink: null,
      soft: 'juice',
    });
    for (const cat of [null, 'soup', 'salad', 'pasta', 'side', 'drinks', 'appetizer'] as const)
      expect(p('Plat', cat, ['eau']).soft).toBeTruthy();
  });
});

describe('while it cooks', () => {
  const s = (text: string, timerSeconds: number | null = null) => ({ text, timerSeconds });
  it('suggests the next preparation steps during a long passive step', () => {
    const steps = [
      s('Enfourner pour 40 minutes à 180 °C.'),
      s('Pendant ce temps, émincer les oignons.'),
      s('Râper le fromage.'),
      s('Laisser reposer 10 minutes.'),
    ];
    expect(parallelSteps(steps, 0).map((x) => x.index)).toEqual([1, 2]);
  });
  it('nothing for a short or active step, and stops at a step that needs the oven', () => {
    expect(
      parallelSteps([s('Faire revenir les oignons 3 minutes.'), s('Couper le persil.')], 0),
    ).toEqual([]);
    expect(
      parallelSteps([s('Cuire 20 min.'), s('Enfourner le gratin.'), s('Couper le pain.')], 0),
    ).toEqual([]);
    expect(parallelSteps([], 3)).toEqual([]);
  });
});

describe('leftovers', () => {
  const r = (id: string, title: string, ...names: string[]) => ({
    id,
    title,
    ingredients: ing(...names),
  });
  it('finds recipes for what is left, leftover dishes first, not the dish just eaten', () => {
    const eaten = [r('a', 'Poulet curry', 'poulet', 'riz basmati', 'curry')];
    const lib = [
      eaten[0]!,
      r('b', 'Riz sauté aux légumes', 'riz cuit', 'oeuf', 'petits pois'),
      r('c', 'Risotto', 'riz arborio', 'bouillon', 'parmesan', 'vin blanc', 'beurre'),
      r('d', 'Salade de poulet', 'poulet', 'salade'),
      r('e', 'Tarte aux pommes', 'pommes', 'pâte'),
    ];
    const ideas = leftoverIdeas(eaten, lib);
    expect(ideas.map((i) => i.base)).toEqual(['rice', 'chicken']);
    expect(ideas[0]!.recipes.map((x) => x.id)).toEqual(['b', 'c']);
    expect(ideas[1]!.recipes.map((x) => x.id)).toEqual(['d']);
  });
  it('nothing eaten, nothing suggested', () => {
    expect(leftoverIdeas([], [r('a', 'Riz', 'riz')])).toEqual([]);
  });
});

describe('badges', () => {
  const facts = (f: Partial<RecipeFacts> = {}): RecipeFacts => ({
    category: null,
    cuisine: null,
    vegetarian: false,
    fish: false,
    seasons: [],
    minutes: null,
    ...f,
  });
  it('counts, records the day each is won, and reports new ones', () => {
    const logs: CookedLike[] = Array.from({ length: 10 }, (_, i) => ({
      recipeId: `r${i % 6}`,
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      hasPhoto: i < 3,
    }));
    const by = (id: string) =>
      id === 'r0'
        ? facts({ cuisine: 'italian', vegetarian: true })
        : facts({ cuisine: id === 'r1' ? 'thai' : null, minutes: 20 });
    const all = computeBadges(logs, by);
    const get = (id: string) => all.find((b) => b.id === id)!;
    expect(get('firstCook')).toMatchObject({ progress: 1, wonOn: '2026-01-01' });
    expect(get('cooks10')).toMatchObject({ progress: 10, wonOn: '2026-01-10' });
    expect(get('explorer25').progress).toBe(6);
    expect(get('world5').progress).toBe(2);
    expect(get('photographer10').progress).toBe(3);
    expect(get('quick10').progress).toBe(8);
    const before = computeBadges(logs.slice(0, 9), by);
    expect(newlyWon(before, all)).toEqual(['cooks10']);
  });
  it('weeks in a row', () => {
    const dates = ['2026-03-02', '2026-03-10', '2026-03-17', '2026-03-24', '2026-04-20'];
    const b = computeBadges(
      dates.map((date) => ({ recipeId: 'x', date, hasPhoto: false })),
      () => null,
    );
    expect(b.find((x) => x.id === 'streak4')).toMatchObject({ progress: 4, wonOn: '2026-03-24' });
  });
});

describe('year in review', () => {
  it('sums the year only, with new recipes and favourites', () => {
    const logs: CookedLike[] = [
      { recipeId: 'old', date: '2025-12-30', hasPhoto: false },
      { recipeId: 'old', date: '2026-02-01', hasPhoto: true },
      { recipeId: 'new', date: '2026-02-08', hasPhoto: false },
      { recipeId: 'new', date: '2026-07-05', hasPhoto: false },
      { recipeId: 'new', date: '2027-01-01', hasPhoto: false },
    ];
    const y = yearReview(
      logs,
      (id) => ({
        category: 'main',
        cuisine: id === 'new' ? 'thai' : 'french',
        vegetarian: id === 'new',
        fish: false,
        seasons: [],
        minutes: null,
      }),
      2026,
    );
    expect(y).toMatchObject({
      cooks: 3,
      distinctRecipes: 2,
      newRecipes: 1,
      photos: 1,
      topCuisine: 'thai',
      topCategory: 'main',
      favoriteWeekday: 0,
    });
    expect(y.topRecipes[0]).toEqual({ recipeId: 'new', count: 2 });
    expect(y.byMonth[1]).toBe(2);
    expect(y.vegetarianShare).toBeCloseTo(2 / 3);
  });
});

describe('home moments', () => {
  it('moment of the day', () => {
    const at = (h: number, m = 0) => mealMoment(new Date(2026, 9, 30, h, m));
    expect([at(7), at(12), at(16), at(19), at(23), at(2)]).toEqual([
      'breakfast',
      'lunch',
      'snack',
      'dinner',
      'late',
      'late',
    ]);
  });
  it('produce in season used by the recipes, most used first', () => {
    expect(seasonalProduce('Fraises gariguettes')).toBe('fraise');
    expect(seasonalProduce('pommes de terre')).toBeNull();
    const h = seasonalHighlights(
      [
        { id: 'a', ingredients: ing('Fraises', 'sucre') },
        { id: 'b', ingredients: ing('fraises gariguettes', 'asperges') },
        { id: 'c', ingredients: ing('Asperges vertes') },
        { id: 'd', ingredients: ing('courge') },
      ],
      'spring',
    );
    expect(h.map((x) => [x.key, x.label, x.recipeIds.length])).toEqual([
      ['asperge', 'asperges', 2],
      ['fraise', 'Fraises', 2],
    ]);
  });
  it('one suggestion per day, stable during the day', () => {
    const list = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(pickOfTheDay(list, '2026-10-30')).toBe(pickOfTheDay(list, '2026-10-30'));
    const days = new Set(
      Array.from({ length: 20 }, (_, i) =>
        pickOfTheDay(list, `2026-11-${String(i + 1).padStart(2, '0')}`),
      ),
    );
    expect(days.size).toBeGreaterThan(2);
    expect(days.has('f')).toBe(false);
    expect(pickOfTheDay([], '2026-10-30')).toBeNull();
  });
});

describe('recipe data: cuisine and step notes', () => {
  const base = {
    title: 'x',
    photoKey: null,
    prepMinutes: null,
    cookMinutes: null,
    restMinutes: null,
    totalMinutes: null,
    servings: 2,
    difficulty: null,
    seasons: [],
    category: null,
    ovenTemperatureC: null,
    ovenMode: null,
    sourceUrl: null,
    tags: [],
    ingredients: [],
    steps: [],
  };
  it('older data stays valid; notes are bounded', () => {
    expect(recipeDataSchema.parse(base)).toMatchObject({ cuisine: null, stepNotes: {} });
    const id = '0190c8a4-1d2e-7a3b-8c4d-5e6f7a8b9c0d';
    expect(
      recipeDataSchema.safeParse({ ...base, stepNotes: { [id]: 'baisser à 170' } }).success,
    ).toBe(true);
    expect(
      recipeDataSchema.safeParse({ ...base, stepNotes: { [id]: 'x'.repeat(501) } }).success,
    ).toBe(false);
    expect(recipeDataSchema.safeParse({ ...base, stepNotes: { nope: 'x' } }).success).toBe(false);
    expect(recipeDataSchema.safeParse({ ...base, cuisine: 'martian' }).success).toBe(false);
  });
});
