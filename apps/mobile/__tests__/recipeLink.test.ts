import { emptyRecipe } from '@pepperedapron/client';
import { parseIngredientLine } from '@pepperedapron/core';
import { draftFromLink, LINK_PREFIX, MAX_LINK_LENGTH, recipeLink } from '../src/lib/recipeLink';

const ing = (l: string) => ({ id: l, group: null, ...parseIngredientLine(l)! });
const step = (text: string) => ({
  id: text,
  group: null,
  text,
  timerSeconds: null,
  timerLabel: null,
});

describe('a recipe inside a QR code link', () => {
  it('goes through the link and comes back', () => {
    const r = {
      ...emptyRecipe(4),
      title: 'Crêpes de mamie',
      prepMinutes: 10,
      ingredients: [ing('250 g de farine'), ing('4 œufs'), ing('50 cl de lait')],
      steps: [step('Mélanger farine et œufs.'), step('Ajouter le lait.')],
    };
    const link = recipeLink(r)!;
    expect(link.complete).toBe(true);
    expect(link.url.startsWith(LINK_PREFIX)).toBe(true);
    const d = draftFromLink(link.url.slice(LINK_PREFIX.length))!;
    expect(d.title).toBe('Crêpes de mamie');
    expect(d.servings).toBe(4);
    expect(d.prepMinutes).toBe(10);
    expect(d.ingredients.map((i) => [i.quantity, i.unit, i.name])).toEqual([
      [250, 'g', 'farine'],
      [4, null, 'œufs'],
      [50, 'cl', 'lait'],
    ]);
    expect(d.steps.map((s) => s.text)).toEqual(['Mélanger farine et œufs.', 'Ajouter le lait.']);
  });

  it('keeps only ingredients and steps when too long, refuses when still too long', () => {
    const words = (n: number, seed: number) =>
      Array.from({ length: n }, (_, k) => ((k * 7919 + seed) % 99991).toString(36)).join(' ');
    const r = {
      ...emptyRecipe(4),
      title: 'Long',
      description: words(1200, 1),
      ingredients: [ing('1 citron')],
      steps: [step('Presser.')],
    };
    const link = recipeLink(r)!;
    expect(link.complete).toBe(false);
    expect(link.url.length).toBeLessThanOrEqual(MAX_LINK_LENGTH);
    expect(recipeLink({ ...r, steps: [step(words(1500, 2))] })).toBeNull();
  });

  it('ignores a broken link', () => {
    expect(draftFromLink('not-a-recipe')).toBeNull();
  });
});
