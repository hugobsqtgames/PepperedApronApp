import { describe, expect, it } from 'vitest';
import { uuidv7 } from './ids';
import { mealPlanEntryDataSchema, recipeDataSchema, shoppingItemDataSchema } from './schemas';
import { diffFields, ENTITY_SCHEMAS, mergeChangedFields, pushRequestSchema } from './sync';

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
  visibility: 'private',
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
  originRecipeId: null,
  householdId: null,
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
      householdId: null,
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
    expect(Object.keys(ENTITY_SCHEMAS)).toHaveLength(9);
  });
});

describe('sync merge', () => {
  it('applies only changed fields on stale base', () => {
    const server = { title: 'A (server)', servings: 4, notes: 'server note' };
    const client = { title: 'A', servings: 6, notes: 'server note' };
    expect(mergeChangedFields(server, client, ['servings'])).toEqual({
      title: 'A (server)',
      servings: 6,
      notes: 'server note',
    });
    expect(mergeChangedFields(server, client, null)).toEqual(client);
    expect(mergeChangedFields(server, client, ['nope'])).toEqual(server);
  });
  it('diffFields', () => {
    expect(diffFields({ a: 1, b: [1] }, { a: 1, b: [2] })).toEqual(['b']);
    expect(diffFields(null, { a: 1 })).toEqual(['a']);
  });
  it('push request limits', () => {
    expect(pushRequestSchema.safeParse({ ops: [] }).success).toBe(false);
    expect(
      pushRequestSchema.safeParse({
        ops: [
          {
            opId: 'x',
            entity: 'recipe',
            id: uuidv7(),
            op: 'upsert',
            baseVersion: null,
            changedFields: null,
            data: {},
          },
        ],
      }).success,
    ).toBe(false);
  });
});
