import { describe, expect, it } from 'vitest';
import { addDays } from '@pepperedapron/core';
import { emptyRecipe, LocalStore, Repos } from '../src';
import { betterSqliteDriver } from './betterSqliteDriver';

async function open() {
  const store = await LocalStore.open(betterSqliteDriver());
  return { store, repos: new Repos(store) };
}
const ing = (name: string, quantity: number | null = null, unit: string | null = null) => ({
  id: crypto.randomUUID(),
  group: null,
  name,
  quantity,
  quantityMax: null,
  unit,
  note: null,
});

describe('cooking history', () => {
  it('logs one entry per day and finds recipes not cooked for a while', async () => {
    const { repos } = await open();
    const a = await repos.createRecipe({ ...emptyRecipe(), title: 'Lasagnes' });
    const b = await repos.createRecipe({ ...emptyRecipe(), title: 'Soupe' });
    await repos.logCooked(a.id, '2026-06-01');
    await repos.logCooked(a.id, '2026-06-01');
    await repos.logCooked(a.id, '2026-07-01');
    await repos.logCooked(b.id, '2026-10-20');
    expect(repos.cookLogs(a.id).map((c) => c.data.date)).toEqual(['2026-07-01', '2026-06-01']);
    expect(repos.cookStats().get(a.id)).toEqual({ count: 2, last: '2026-07-01' });
    expect(repos.forgottenRecipes('2026-10-29').map((r) => r.id)).toEqual([a.id]);
    await repos.deleteRecipe(a.id);
    expect(repos.cookStats().has(a.id)).toBe(false);
  });
});

describe('rating, personal note, review flag', () => {
  it('are stored on the recipe', async () => {
    const { repos } = await open();
    const r = await repos.createRecipe({ ...emptyRecipe(), title: 'Tarte', review: 'speech' });
    await repos.setRating(r.id, 4);
    await repos.setPersonalNote(r.id, '  Moins de sucre  ');
    await repos.dismissReview(r.id);
    expect(repos.recipe(r.id)!.data).toMatchObject({
      rating: 4,
      personalNote: 'Moins de sucre',
      review: null,
    });
  });
});

describe('duplicates', () => {
  it('finds the same reel and similar recipes', async () => {
    const { repos } = await open();
    const r = await repos.createRecipe({
      ...emptyRecipe(),
      title: 'Pâtes au pesto',
      sourceUrl: 'https://www.instagram.com/reel/ABC/',
      ingredients: [ing('pâtes'), ing('pesto'), ing('parmesan')],
    });
    expect(
      repos.findDuplicate({
        title: 'x',
        sourceUrl: 'https://instagram.com/p/ABC/?igsh=2',
        ingredientNames: [],
      }),
    ).toEqual({ id: r.id, reason: 'link' });
    expect(repos.findDuplicate({ title: 'x', sourceUrl: null, ingredientNames: [] })).toBeNull();
    expect(
      repos.findDuplicate({ title: 'Pâtes au pesto', sourceUrl: null, ingredientNames: [] }, r.id),
    ).toBeNull();
  });
});

describe('leftovers and reusable weeks', () => {
  it('leftovers are planned but not bought twice', async () => {
    const { repos } = await open();
    const r = await repos.createRecipe({
      ...emptyRecipe(4),
      title: 'Chili',
      ingredients: [ing('haricots rouges', 400, 'g')],
    });
    const dinner = await repos.planMeal({ date: '2026-10-26', slot: 'dinner', recipeId: r.id });
    const left = await repos.planLeftovers(dinner.id, 2);
    expect(left.data).toMatchObject({
      date: '2026-10-27',
      slot: 'lunch',
      servings: 2,
      leftover: true,
    });
    expect(repos.entries('2026-10-26', '2026-10-26')[0]!.data.servings).toBe(6);
    const list = await repos.createList('Courses');
    await repos.addPlanToList(list.id, '2026-10-26', '2026-11-01');
    // 400 g for 4 → 600 g for 6 (the leftovers' 2 portions are not added again).
    expect(repos.items(list.id).map((i) => [i.data.name, i.data.quantity, i.data.unit])).toEqual([
      ['haricots rouges', 600, 'g'],
    ]);
  });

  it('a week saved as a template fills another week', async () => {
    const { repos } = await open();
    const r = await repos.createRecipe({ ...emptyRecipe(), title: 'Gratin' });
    const ws = '2026-10-26';
    await repos.planMeal({ date: ws, slot: 'dinner', recipeId: r.id, servings: 3 });
    await repos.planMeal({ date: addDays(ws, 4), slot: 'lunch', customTitle: 'Restaurant' });
    const tp = await repos.saveWeekAsTemplate('Semaine classique', ws);
    expect(tp.data.meals).toHaveLength(2);
    const next = addDays(ws, 7);
    await repos.planMeal({ date: next, slot: 'breakfast', customTitle: 'Céréales' });
    expect(await repos.applyTemplate(tp.id, next, true)).toBe(2);
    expect(
      repos.entries(next, addDays(next, 6)).map((e) => [e.data.date, e.data.slot, e.data.servings]),
    ).toEqual([
      [next, 'dinner', 3],
      [addDays(next, 4), 'lunch', null],
    ]);
    await repos.deleteRecipe(r.id);
    expect(repos.templates()[0]!.data.meals[0]).toMatchObject({
      recipeId: null,
      customTitle: 'Gratin',
    });
  });
});

describe('budget', () => {
  it('remembers prices and estimates the next lists', async () => {
    const { repos } = await open();
    const list = await repos.createList('Courses');
    const milk = await repos.addItem(list.id, { name: 'Lait', quantity: 1, unit: 'l' });
    expect(milk.data.price).toBeNull();
    await repos.setItemPrice(milk.id, 1.2);
    const more = await repos.addItem(list.id, { name: 'lait', quantity: 2, unit: 'l' });
    expect(more.data.price).toBe(2.4);
  });
});
