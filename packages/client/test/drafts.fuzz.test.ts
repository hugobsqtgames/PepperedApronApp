/**
 * Every importer's output must be savable: whatever a web page, a caption, a transcript or a QR
 * code contains, recipeFromDraft gives a recipe that passes the data model's validation.
 */
import { afterAll, describe, expect, it } from 'vitest';
import {
  emptyDraft,
  parseJsonLdRecipe,
  parseRecipeText,
  recipeDataSchema,
  recipeFromTranscript,
  type RecipeDraft,
} from '@pepperedapron/core';
import { casesRun, rng, type Rng } from '../../core/src/fuzz/rng';
import { recipeFromDraft } from '../src';

const N = 800;
const big = (r: Rng) => 'x'.repeat(r.pick([0, 10, 3000, 6000, 30_000]));

function wildDraft(r: Rng): RecipeDraft {
  const d = emptyDraft();
  d.title = r.pick([null, '', '   ', r.junk(5), big(r)]);
  d.description = r.pick([null, r.junk(10), big(r)]);
  d.servings = r.pick([null, 0, -2, 1, 4, 250, 3.5]);
  d.prepMinutes = r.pick([null, 0, -5, 30, 99_999, 12.5]);
  d.cookMinutes = r.pick([null, 45, 1e9]);
  d.totalMinutes = r.pick([null, 60, -1]);
  d.ovenTemperatureC = r.pick([null, 10, 180, 900, 200.4]);
  d.notes = r.pick([null, r.junk(10), big(r)]);
  d.tips = r.pick([null, big(r)]);
  d.yieldLabel = r.pick([null, r.junk(3), big(r)]);
  d.source = r.pick([null, r.junk(4), big(r)]);
  d.author = r.pick([null, r.junk(3), big(r)]);
  d.sourceUrl = r.pick([
    null,
    'https://a.fr/x',
    'javascript:alert(1)',
    'ftp://x',
    `https://a.fr/${big(r)}`,
    'pas une url',
  ]);
  d.tags = Array.from({ length: r.int(0, 40) }, () =>
    r.pick(['', ' ', r.word(), big(r).slice(0, 80), 'Dessert', 'dessert']),
  );
  d.unparsed = Array.from({ length: r.int(0, 5) }, () => big(r));
  d.ingredients = Array.from({ length: r.pick([0, 3, 250]) }, () => ({
    group: r.pick([null, r.word(), big(r).slice(0, 200)]),
    name: r.pick([r.word() || 'x', big(r).slice(0, 500) || 'y']),
    quantity: r.pick([null, 1, 0, -1, 1e7, 0.5]),
    quantityMax: r.pick([null, 2, -3]),
    unit: r.pick([null, 'g', big(r).slice(0, 100)]),
    note: r.pick([null, big(r).slice(0, 500)]),
  }));
  d.steps = Array.from({ length: r.pick([0, 2, 150]) }, () => ({
    group: r.pick([null, big(r).slice(0, 200)]),
    text: r.pick(['Cuire.', big(r) || 'z']),
    timerSeconds: r.pick([null, 0, 60, 1e9, 30.5]),
    timerLabel: r.pick([null, big(r).slice(0, 100)]),
  }));
  return d;
}

describe('every imported draft can be saved', () => {
  it(`${N} extreme drafts become valid recipes`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(90_000 + s);
      const d = wildDraft(r);
      const data = recipeFromDraft(d, 4);
      // The title is the caller's job (placeholder on import, required in the editor).
      data.title ||= 'Titre';
      const res = recipeDataSchema.safeParse(data);
      expect(res.success, `seed ${s}: ${JSON.stringify(res.error?.issues?.slice(0, 3))}`).toBe(
        true,
      );
    }
  });

  it(`${N} drafts from real importers on random input become valid recipes`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(91_000 + s);
      const d = r.pick([
        () => parseRecipeText(Array.from({ length: r.int(1, 40) }, () => r.junk(20)).join('\n')),
        () => {
          const t = recipeFromTranscript(Array.from({ length: r.int(1, 20) }, () => r.junk(15)));
          return { ...emptyDraft(), ingredients: t.ingredients, steps: t.steps, notes: t.text };
        },
        () =>
          parseJsonLdRecipe(
            `<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: r.junk(8), description: big(r), recipeYield: r.int(-10, 1000), prepTime: `PT${r.int(0, 99999)}M`, recipeIngredient: Array.from({ length: r.int(0, 300) }, () => r.junk(5)), recipeInstructions: Array.from({ length: r.int(0, 150) }, () => r.junk(10)), keywords: Array.from({ length: 30 }, () => r.word()).join(',') })}</script>`,
          ) ?? emptyDraft(),
      ])();
      d.title ||= 'Titre';
      const res = recipeDataSchema.safeParse(recipeFromDraft(d, 4));
      expect(res.success, `seed ${s}: ${JSON.stringify(res.error?.issues?.slice(0, 3))}`).toBe(
        true,
      );
    }
  });
});

afterAll(() => console.info(`QA-COUNT client.fuzz.drafts.cases ${casesRun()}`));
