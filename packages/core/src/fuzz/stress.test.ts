/**
 * Stress: pathological inputs (huge, repetitive, deeply nested) for every parser. Each one must
 * answer within a time budget: a regular expression that backtracks would freeze the app.
 * STRESS=1 multiplies the number of cases. Counts are printed as "QA-COUNT".
 */
import { describe, expect, it } from 'vitest';
import { parseIngredientLine } from '../parse/ingredient';
import { parseRecipeText } from '../parse/text';
import { parseHtmlMeta, parseJsonLdRecipe } from '../parse/jsonld';
import { recipeFromTranscript } from '../parse/transcript';
import { ingredientsFromScreenText } from '../parse/onscreen';
import { extractUrls } from '../parse/links';
import {
  instagramCaption,
  tiktokCaption,
  unflattenCaption,
  youtubeDescription,
} from '../parse/social';
import { pinterestSourceUrl } from '../parse/url';
import { parseDurationText, parseTimerSeconds } from '../duration';
import { scaleStepText, findMoldSize } from '../cooking';
import { parseSearchQuery, searchRecipes, EMPTY_FILTERS } from '../search';
import { stepIngredients, voiceCommand } from '../steps';
import { stripHtml } from '../text';
import { rng } from './rng';

const SCALE = process.env.STRESS ? 5 : 1;
const BUDGET_MS = 1500;

/** Inputs known to hurt naive parsers. */
export function nasty(r: ReturnType<typeof rng>): string {
  const n = r.pick([1_000, 10_000, 100_000, 400_000]);
  const unit = r.pick([
    '1 ',
    '1/2 ',
    '1,5 ',
    'a ',
    '- ',
    ' ',
    '\n',
    '<div>',
    '&amp;',
    '200 g de ',
    'https://x.fr/',
    'PT1H',
    '((((',
    '"',
    '{"a":',
    '🍅',
    'cuire 10 min ',
    'h ',
    '1 h 1 h ',
    'à',
  ]);
  return r.pick([
    () => unit.repeat(Math.ceil(n / unit.length)).slice(0, n),
    () =>
      r
        .junk(200)
        .repeat(Math.ceil(n / 400))
        .slice(0, n),
    () => '9'.repeat(Math.min(n, 50_000)) + ' g',
    () => `${'<div>'.repeat(5000)}${'</div>'.repeat(5000)}`,
    () => `${'['.repeat(3000)}${']'.repeat(3000)}`,
    () => Array.from({ length: 2000 }, () => `${r.int(1, 9)} ${r.word(4)}`).join('\n'),
  ])();
}

const timed = (label: string, fn: () => unknown) => {
  const t = performance.now();
  fn();
  const ms = performance.now() - t;
  expect(ms, `${label}: ${Math.round(ms)} ms`).toBeLessThan(BUDGET_MS);
};

describe('parsers under pathological input', () => {
  const N = 40 * SCALE;
  it(`${N} huge inputs × 18 parsers answer in time`, () => {
    let runs = 0;
    for (let s = 1; s <= N; s++) {
      const r = rng(200_000 + s);
      const text = nasty(r);
      const line = text.slice(0, 2000);
      const html = `<html><head><meta property="og:description" content="${text.slice(0, 50_000).replace(/"/g, '')}"><script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: line, recipeIngredient: [line, line], recipeInstructions: text.slice(0, 100_000) })}</script></head></html>`;
      const fns: [string, () => unknown][] = [
        ['ingredient', () => parseIngredientLine(line)],
        ['recipe text', () => parseRecipeText(text.slice(0, 20_000))],
        ['json-ld', () => parseJsonLdRecipe(html)],
        ['meta', () => parseHtmlMeta(html)],
        ['transcript', () => recipeFromTranscript(text.slice(0, 20_000).split('\n').slice(0, 300))],
        ['on screen', () => ingredientsFromScreenText([text.slice(0, 5000).split('\n')])],
        ['urls', () => extractUrls(text)],
        ['instagram', () => instagramCaption(text.slice(0, 20_000))],
        ['tiktok', () => tiktokCaption(html)],
        ['youtube', () => youtubeDescription(html)],
        ['unflatten', () => unflattenCaption(text.slice(0, 20_000))],
        ['pinterest', () => pinterestSourceUrl(html)],
        ['duration', () => parseDurationText(line)],
        ['timer', () => parseTimerSeconds(line)],
        ['scale step', () => scaleStepText(text.slice(0, 3000), 2, 'fr')],
        ['mold', () => findMoldSize([text.slice(0, 5000)])],
        ['query', () => parseSearchQuery(line.slice(0, 500))],
        ['strip html', () => stripHtml(text.slice(0, 100_000))],
      ];
      for (const [label, fn] of fns) {
        timed(`seed ${s} ${label}`, fn);
        runs++;
      }
      timed(`seed ${s} step`, () => stepIngredients(text.slice(0, 3000), [{ name: 'farine' }]));
      timed(`seed ${s} voice`, () => voiceCommand(text.slice(0, 3000)));
      runs += 2;
    }
    console.info(`QA-COUNT core.parsers.pathological ${runs}`);
  }, 600_000);

  it(`search over 10 000 recipes × ${100 * SCALE} random queries stays fast`, () => {
    const r = rng(210_000);
    const lib = Array.from({ length: 10_000 }, (_, i) => ({
      id: String(i),
      title: `${r.pick(['Poulet', 'Tarte', 'Soupe', 'Pâtes'])} ${r.word(6)}`,
      description: null,
      category: null,
      tags: [r.word(4)],
      difficulty: null,
      seasons: [],
      totalMinutes: r.int(5, 200),
      ingredientNames: Array.from({ length: 10 }, () => r.word(6)),
      updatedAt: '2026-01-01',
    }));
    let runs = 0;
    for (let k = 0; k < 100 * SCALE; k++) {
      const q = r.pick([
        () => r.junk(6),
        () => r.word(3),
        () => 'poulet rapide sans ail',
        () => '',
      ])();
      timed(`query ${k}`, () =>
        searchRecipes(lib, q, { ...EMPTY_FILTERS, fridge: r.bool(0.1) ? [r.word(4)] : [] }),
      );
      runs++;
    }
    console.info(`QA-COUNT core.search.10000 ${runs}`);
  }, 600_000);
});
