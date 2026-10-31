import { describe, expect, it } from 'vitest';
import {
  cookingPlan,
  estimateRecipe,
  estimateStep,
  readyTimeChoices,
  startTimeFor,
  type PlanRecipe,
} from './schedule';

const step = (text: string, timerSeconds: number | null = null) => ({ text, timerSeconds });

const gratin: PlanRecipe = {
  id: 'gratin',
  title: 'Gratin dauphinois',
  steps: [
    step('Éplucher et couper les pommes de terre en fines rondelles.'),
    step('Faire chauffer le lait et la crème avec l’ail.'),
    step('Disposer dans le plat et enfourner 50 min à 180 °C.'),
  ],
};
const salade: PlanRecipe = {
  id: 'salade',
  title: 'Salade verte',
  steps: [step('Laver et essorer la salade.'), step('Préparer la vinaigrette et mélanger.')],
};
const roti: PlanRecipe = {
  id: 'roti',
  title: 'Rôti de porc',
  steps: [
    step('Assaisonner le rôti.'),
    step('Cuire au four 1 h.'),
    step('Laisser reposer 10 min avant de trancher.'),
  ],
};

describe('step estimates', () => {
  it('a long oven step frees the cook after a short start', () => {
    expect(estimateStep(step('Enfourner 50 min.'))).toMatchObject({ active: 2, passive: 48 });
    // Stirring keeps the cook at the stove for the whole timer.
    expect(estimateStep(step('Faire revenir les oignons 10 min en remuant.'))).toMatchObject({
      active: 10,
      passive: 0,
    });
    expect(estimateStep(step('Couper.')).active).toBeGreaterThanOrEqual(2);
  });

  it('guessed durations follow the recipe total time', () => {
    const sum = (r: PlanRecipe) => estimateRecipe(r).reduce((s, e) => s + e.active + e.passive, 0);
    const long = sum({ ...salade, totalMinutes: 30 });
    expect(long).toBeGreaterThan(sum(salade));
    expect(long).toBeLessThanOrEqual(31);
  });
});

describe('cooking plan', () => {
  it('batch cooking interleaves the recipes and is shorter than one after the other', () => {
    const p = cookingPlan([salade, gratin, roti], 'asap');
    const serial = [salade, gratin, roti]
      .flatMap(estimateRecipe)
      .reduce((s, e) => s + e.active + e.passive, 0);
    expect(p.minutes).toBeLessThan(serial * 0.75);
    expect(p.items).toHaveLength(8);
    // The longest recipe starts first.
    expect(p.items[0]!.recipeId).toBe('roti');
    // Steps of a recipe stay in order, each after the previous one ends.
    for (const r of [salade, gratin, roti]) {
      const own = p.items.filter((i) => i.recipeId === r.id);
      expect(own.map((i) => i.stepIndex)).toEqual(own.map((_, k) => k));
      for (let k = 1; k < own.length; k++)
        expect(own[k]!.start).toBeGreaterThanOrEqual(own[k - 1]!.end);
    }
    // One pair of hands: hands-on parts never overlap.
    const hands = p.items
      .map((i) => [i.start, i.start + i.handsOn] as const)
      .sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < hands.length; k++)
      expect(hands[k]![0]).toBeGreaterThanOrEqual(hands[k - 1]![1]);
  });

  it('a meal: every dish is ready at the same time', () => {
    const p = cookingPlan([gratin, salade], 'together');
    const ends = p.recipes.map((r) => r.end);
    expect(Math.max(...ends) - Math.min(...ends)).toBeLessThanOrEqual(5);
    // The salad is made at the end, while the gratin bakes, not at the beginning.
    const salad = p.recipes.find((r) => r.id === 'salade')!;
    expect(salad.start).toBeGreaterThan(10);
    expect(p.items[0]!.recipeId).toBe('gratin');
    expect(Math.min(...p.items.map((i) => i.start))).toBe(0);
  });

  it('recipes without steps are left out', () => {
    expect(cookingPlan([{ id: 'x', title: 'X', steps: [] }], 'asap')).toMatchObject({
      minutes: 0,
      items: [],
      recipes: [],
    });
  });
});

describe('ready at…', () => {
  const now = new Date(2026, 9, 31, 18, 10);
  it('start time for a meal at a given time', () => {
    const r = startTimeFor('20:00', 75, now)!;
    expect(r.start.getHours()).toBe(18);
    expect(r.start.getMinutes()).toBe(45);
    expect(startTimeFor('18:00', 75, now)?.ready.getDate()).toBe(1); // tomorrow
    expect(startTimeFor('18:30', 75, now)).toBeNull(); // no longer time
    expect(startTimeFor('25:00', 10, now)).toBeNull();
  });
  it('offers the next half hours when the meal can be ready', () => {
    expect(readyTimeChoices(40, now, 3)).toEqual(['19:00', '19:30', '20:00']);
  });
});
