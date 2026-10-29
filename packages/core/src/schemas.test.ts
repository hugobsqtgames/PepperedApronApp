import { describe, expect, it } from 'vitest';
import { uuidv7 } from './ids';
import {
  DEFAULT_SETTINGS,
  mealPlanEntryDataSchema,
  recipeDataSchema,
  settingsDataSchema,
  shoppingItemDataSchema,
} from './schemas';
import { diffFields, ENTITY_ORDER, ENTITY_SCHEMAS, SYNC_ENTITIES } from './sync';

export const validRecipe = () => ({
  title: '  Tarte  ',
  description: '',
  photoKey: null,
  prepMinutes: 10,
  cookMinutes: 20,
  restMinutes: null,
  totalMinutes: null,
  servings: 4,
  yieldLabel: null,
  difficulty: 'easy',
  seasons: ['autumn', 'autumn'],
  category: 'dessert',
  ovenTemperatureC: 180,
  ovenMode: null,
  notes: null,
  tips: null,
  extraInfo: null,
  source: null,
  sourceUrl: null,
  tags: ['Rapide', 'rapide'],
  ingredients: [
    {
      id: uuidv7(),
      group: null,
      name: 'Farine',
      quantity: 200,
      quantityMax: null,
      unit: 'g',
      note: null,
    },
  ],
  steps: [{ id: uuidv7(), group: null, text: 'Cuire', timerSeconds: 600, timerLabel: null }],
});

describe('recipe validation', () => {
  it('accepts a valid recipe and normalises it', () => {
    const r = recipeDataSchema.parse(validRecipe());
    expect(r.title).toBe('Tarte');
    expect(r.description).toBeNull();
    expect(r.seasons).toEqual(['autumn']);
    expect(r.tags).toEqual(['rapide']);
  });
  it('photo is optional; recipe without ingredients/steps is allowed as a draft', () => {
    expect(
      recipeDataSchema.safeParse({ ...validRecipe(), photoKey: null, ingredients: [], steps: [] })
        .success,
    ).toBe(true);
  });
  it.each([
    ['empty title', { title: '   ' }],
    ['zero servings', { servings: 0 }],
    ['absurd servings', { servings: 10_000 }],
    ['negative time', { prepMinutes: -5 }],
    ['float time', { cookMinutes: 1.5 }],
    ['oven too hot', { ovenTemperatureC: 1000 }],
    ['bad category', { category: 'pizza-party' }],
    ['javascript url', { sourceUrl: 'javascript:alert(1)' }],
    ['huge title', { title: 'x'.repeat(500) }],
    ['unknown field', { userId: 'someone-else' }],
    [
      'impossible quantity',
      {
        ingredients: [
          {
            id: uuidv7(),
            group: null,
            name: 'x',
            quantity: -1,
            quantityMax: null,
            unit: null,
            note: null,
          },
        ],
      },
    ],
    [
      'empty step',
      { steps: [{ id: uuidv7(), group: null, text: ' ', timerSeconds: null, timerLabel: null }] },
    ],
    [
      'too many ingredients',
      {
        ingredients: Array.from({ length: 201 }, () => ({
          id: uuidv7(),
          group: null,
          name: 'x',
          quantity: null,
          quantityMax: null,
          unit: null,
          note: null,
        })),
      },
    ],
  ])('rejects %s', (_, patch) => {
    expect(recipeDataSchema.safeParse({ ...validRecipe(), ...patch }).success).toBe(false);
  });
});

describe('other entities', () => {
  it('meal plan entry needs a recipe or a title', () => {
    const base = {
      date: '2026-09-27',
      slot: 'dinner',
      recipeId: null,
      customTitle: null,
      servings: null,
      position: 0,
    };
    expect(mealPlanEntryDataSchema.safeParse(base).success).toBe(false);
    expect(mealPlanEntryDataSchema.safeParse({ ...base, customTitle: 'Restes' }).success).toBe(
      true,
    );
    expect(
      mealPlanEntryDataSchema.safeParse({ ...base, recipeId: uuidv7(), date: '27/09/2026' })
        .success,
    ).toBe(false);
  });
  it('shopping item validation', () => {
    const it = {
      listId: uuidv7(),
      name: 'Lait',
      quantity: null,
      unit: null,
      categoryKey: 'dairy_eggs',
      checked: false,
      position: 0,
      note: null,
      recipeIds: [],
    };
    expect(shoppingItemDataSchema.safeParse(it).success).toBe(true);
    expect(shoppingItemDataSchema.safeParse({ ...it, quantity: 0 }).success).toBe(false);
  });
  it('every entity has a schema', () => {
    expect(Object.keys(ENTITY_SCHEMAS).sort()).toEqual([...SYNC_ENTITIES].sort());
    expect([...ENTITY_ORDER].sort()).toEqual([...SYNC_ENTITIES].sort());
  });
});

describe('settings', () => {
  it('first name is trimmed, optional and accepted from older data without it', () => {
    const { firstName: _omit, ...older } = DEFAULT_SETTINGS;
    expect(settingsDataSchema.parse(older).firstName).toBeNull();
    expect(
      settingsDataSchema.parse({ ...DEFAULT_SETTINGS, firstName: '  Camille ' }).firstName,
    ).toBe('Camille');
    expect(
      settingsDataSchema.parse({ ...DEFAULT_SETTINGS, firstName: '   ' }).firstName,
    ).toBeNull();
    // A language that is no longer offered falls back to the device language.
    expect(settingsDataSchema.parse({ ...DEFAULT_SETTINGS, locale: 'de' }).locale).toBeNull();
    expect(settingsDataSchema.parse({ ...DEFAULT_SETTINGS, locale: 'en' }).locale).toBe('en');
    expect(
      settingsDataSchema.safeParse({ ...DEFAULT_SETTINGS, firstName: 'x'.repeat(41) }).success,
    ).toBe(false);
  });
});

describe('diffFields', () => {
  it('lists changed top-level fields', () => {
    expect(diffFields({ a: 1, b: [1] }, { a: 1, b: [2] })).toEqual(['b']);
    expect(diffFields(null, { a: 1 })).toEqual(['a']);
    expect(diffFields({ a: 1 }, {})).toEqual(['a']);
  });
});

describe('fields added later', () => {
  it('older recipes, meals, items and settings stay valid with defaults', () => {
    const r = recipeDataSchema.parse(validRecipe());
    expect(r.rating).toBeNull();
    expect(r.personalNote).toBeNull();
    expect(r.review).toBeNull();
    expect(
      mealPlanEntryDataSchema.parse({
        date: '2026-10-29',
        slot: 'dinner',
        recipeId: null,
        customTitle: 'Pizza',
        servings: null,
        position: 0,
      }).leftover,
    ).toBe(false);
    expect(
      settingsDataSchema.parse({ ...DEFAULT_SETTINGS, cookTextScale: undefined }).cookTextScale,
    ).toBe(1);
  });
  it('rating is 1 to 5', () => {
    expect(recipeDataSchema.safeParse({ ...validRecipe(), rating: 6 }).success).toBe(false);
    expect(recipeDataSchema.safeParse({ ...validRecipe(), rating: 4 }).success).toBe(true);
  });
  it('new entities', () => {
    expect(
      ENTITY_SCHEMAS.cookLog.safeParse({ recipeId: uuidv7(), date: '2026-10-29' }).success,
    ).toBe(true);
    expect(
      ENTITY_SCHEMAS.planTemplate.safeParse({
        name: 'Semaine classique',
        meals: [{ day: 0, slot: 'dinner', recipeId: null, customTitle: 'Soupe', servings: 2 }],
      }).success,
    ).toBe(true);
    expect(
      ENTITY_SCHEMAS.planTemplate.safeParse({
        name: 'x',
        meals: [{ day: 7, slot: 'dinner', recipeId: null, customTitle: 'a', servings: null }],
      }).success,
    ).toBe(false);
    expect(
      ENTITY_SCHEMAS.price.safeParse({ name: 'Lait', price: 1.2, quantity: 1, unit: 'l' }).success,
    ).toBe(true);
  });
});
