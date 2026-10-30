/**
 * Fuzz and property tests of the app's own logic (deterministic seeds, printed on failure).
 */
jest.mock('../src/services/runtime', () => ({ runtime: { session: null } }));
jest.mock('../src/services/importer', () => ({}));
jest.mock('../src/services/ocr', () => ({}));
jest.mock('../src/services/photos', () => ({}));
jest.mock('../src/services/videoFrames', () => ({}));
jest.mock('../modules/pdf-text', () => ({}));

import { emptyRecipe } from '@pepperedapron/client';
import { parseIngredientLine, uuidv7, type Ingredient } from '@pepperedapron/core';
import { casesRun, rng } from '../../../packages/core/src/fuzz/rng';
import { draftFromLink, LINK_PREFIX, MAX_LINK_LENGTH, recipeLink } from '../src/lib/recipeLink';
import { pickFrames } from '../src/lib/frames';
import { formatIngredient, shoppingListAsText } from '../src/lib/format';
import {
  fromIngRows,
  fromStepRows,
  ingredientToLine,
  toIngRows,
  toStepRows,
} from '../src/features/recipe/editorModel';
import { sourcesFromShare } from '../src/services/autoImport';

const N = 400;

/** check(value, message): the message (the seed) is added to the failure, as in Vitest. */
const check = (value: unknown, message: string) =>
  new Proxy(expect(value), {
    get(target, prop) {
      const v = (target as unknown as Record<string | symbol, unknown>)[prop];
      if (prop === 'not') return check.not(value, message);
      if (typeof v !== 'function') return v;
      return (...args: unknown[]) => {
        try {
          return (v as (...a: unknown[]) => unknown).apply(target, args);
        } catch (e) {
          (e as Error).message = `${message}\n${(e as Error).message}`;
          throw e;
        }
      };
    },
  }) as ReturnType<typeof expect>;
check.not = (value: unknown, message: string) =>
  new Proxy(expect(value).not, {
    get(target, prop) {
      const v = (target as unknown as Record<string | symbol, unknown>)[prop];
      if (typeof v !== 'function') return v;
      return (...args: unknown[]) => {
        try {
          return (v as (...a: unknown[]) => unknown).apply(target, args);
        } catch (e) {
          (e as Error).message = `${message}\n${(e as Error).message}`;
          throw e;
        }
      };
    },
  });
const UNITS = ['g', 'kg', 'ml', 'cl', 'l', 'c. à soupe', 'c. à café', 'pincée', 'cups', 'oz', ''];
const NAMES = [
  'farine',
  'œufs',
  'lait demi-écrémé',
  'beurre',
  'sel',
  'crème fraîche',
  'pommes de terre',
  'sucre roux',
];

function ingredient(r: ReturnType<typeof rng>): Ingredient {
  const q = r.pick([
    `${r.int(1, 900)}`,
    `${r.int(1, 9)},${r.int(1, 9)}`,
    '½',
    '1/4',
    `${r.int(1, 3)}-${r.int(4, 6)}`,
    '',
  ]);
  const line =
    `${q} ${r.pick(UNITS)} ${r.bool() ? 'de ' : ''}${r.pick(NAMES)}${r.bool(0.2) ? ' (tamisée)' : ''}`.trim();
  return { id: uuidv7(), group: null, ...parseIngredientLine(line)! };
}

describe('editor', () => {
  it(`${N} ingredient lists survive the editor unchanged, and re-typed lines read back the same`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(80_000 + s);
      const list = Array.from({ length: r.int(1, 12) }, () => ingredient(r));
      for (const locale of ['fr', 'en'] as const) {
        check(fromIngRows(toIngRows(list, locale), locale), `seed ${s}`).toEqual(list);
        // The user retypes the line exactly as shown: same quantity, unit and name.
        for (const i of list) {
          const back = parseIngredientLine(ingredientToLine(i, locale));
          const m = `seed ${s} ${locale}: ${ingredientToLine(i, locale)} ← ${JSON.stringify(i)}`;
          check(back, m).not.toBeNull();
          if (i.quantity !== null) check(back!.quantity, m).toBeCloseTo(i.quantity, 4);
          check(back!.unit, m).toBe(i.unit);
          check(back!.name, m).toBe(i.name);
        }
      }
      const steps = Array.from({ length: r.int(0, 8) }, () => ({
        id: uuidv7(),
        group: r.bool(0.2) ? 'Sauce' : null,
        text: r.junk(10).trim() || 'x',
        timerSeconds: r.bool() ? r.int(1, 120) * 60 : null,
        timerLabel: null,
      }));
      check(
        fromStepRows(toStepRows(steps)).map((x) => x.text),
        `seed ${s}`,
      ).toEqual(steps.map((x) => x.text));
      for (const i of list)
        formatIngredient(
          i,
          r.pick([0.5, 1, 2, 3]),
          r.pick(['fr', 'en']),
          r.pick(['metric', 'imperial']),
        );
    }
  });
});

describe('QR code links', () => {
  it(`${N} recipes go through a QR code link and come back (or are refused when too long)`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(81_000 + s);
      const rec = {
        ...emptyRecipe(r.int(1, 20)),
        title: r.junk(6).trim() || 'Titre',
        prepMinutes: r.bool() ? r.int(1, 300) : null,
        description: r.bool() ? r.junk(r.int(0, 200)) : null,
        ingredients: Array.from({ length: r.int(0, 15) }, () => ingredient(r)),
        steps: Array.from({ length: r.int(0, 10) }, () => ({
          id: uuidv7(),
          group: null,
          text: r.junk(15).trim() || 'x',
          timerSeconds: null,
          timerLabel: null,
        })),
      };
      const link = recipeLink(rec);
      if (!link) continue;
      check(link.url.length, `seed ${s}`).toBeLessThanOrEqual(MAX_LINK_LENGTH);
      const d = draftFromLink(link.url.slice(LINK_PREFIX.length))!;
      check(d, `seed ${s}`).not.toBeNull();
      check(d.title, `seed ${s}`).toBe(rec.title.slice(0, 200));
      check(
        d.steps.map((x) => x.text),
        `seed ${s}`,
      ).toEqual(rec.steps.map((x) => x.text));
      check(
        d.ingredients.map((i) => i.name),
        `seed ${s}`,
      ).toEqual(rec.ingredients.map((i) => i.name));
      if (link.complete) check(d.prepMinutes, `seed ${s}`).toBe(rec.prepMinutes);
    }
  });

  it(`${N} damaged links are refused without crashing`, () => {
    const good = recipeLink({ ...emptyRecipe(4), title: 'Crêpes' })!.url.slice(LINK_PREFIX.length);
    for (let s = 1; s <= N; s++) {
      const r = rng(82_000 + s);
      const bad = r.pick([
        () => r.junk(30),
        () => good.slice(0, r.int(0, good.length - 1)),
        () =>
          good.slice(0, r.int(0, good.length - 1)) + r.word(3) + good.slice(r.int(0, good.length)),
        () => '',
      ])();
      const d = draftFromLink(bad);
      if (d) check(typeof d.title, `seed ${s}`).toBe('string');
    }
  });
});

describe('sharing and pictures', () => {
  it(`${N} shares become 0..n imports of the right kind`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(83_000 + s);
      const p = {
        text: r.bool()
          ? `${r.junk(10)} ${r.bool() ? `https://www.instagram.com/reel/${r.word(5).replace(/ /g, '')}/` : ''}`
          : null,
        url: r.bool(0.3) ? 'https://www.tiktok.com/@a/video/1' : null,
        title: r.bool() ? r.word() : null,
        images: Array.from({ length: r.pick([0, 0, 1, 3, 12]) }, (_, i) => `file:///i${i}.jpg`),
        videos: r.bool(0.2) ? ['file:///v.mp4'] : [],
        pdfs: r.bool(0.1) ? ['file:///r.pdf'] : [],
      };
      const out = sourcesFromShare(p);
      for (const src of out) {
        check(['link', 'text', 'photos', 'video', 'pdf'], `seed ${s}`).toContain(src.kind);
        if (src.kind === 'photos') check(src.uris.length, `seed ${s}`).toBeLessThanOrEqual(10);
        if (src.kind === 'link') check(src.url, `seed ${s}`).toMatch(/^https?:\/\//);
      }
      if (p.pdfs.length) check(out[0]?.kind, `seed ${s}`).toBe('pdf');
      else if (p.images.length) check(out[0]?.kind, `seed ${s}`).toBe('photos');
    }
  });

  it(`${N} videos: the photos offered are the best ones, spaced in time, at most 6`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(84_000 + s);
      const frames = Array.from({ length: r.int(0, 90) }, (_, i) => ({
        uri: `${i}.jpg`,
        time: i + 0.5,
        score: r.int(0, 10_000),
      }));
      const out = pickFrames(frames);
      check(out.length, `seed ${s}`).toBeLessThanOrEqual(6);
      const chosen = out.map((u) => frames.find((f) => f.uri === u)!);
      for (let i = 0; i < chosen.length; i++)
        for (let j = i + 1; j < chosen.length; j++)
          check(Math.abs(chosen[i]!.time - chosen[j]!.time), `seed ${s}`).toBeGreaterThanOrEqual(
            2.5,
          );
      if (frames.length)
        check(chosen[0]!.score, `seed ${s}`).toBe(Math.max(...frames.map((f) => f.score)));
      for (let i = 1; i < chosen.length; i++)
        check(chosen[i - 1]!.score, `seed ${s}`).toBeGreaterThanOrEqual(chosen[i]!.score);
    }
  });

  it(`${N} shopping lists are written as text with every open item, none ticked`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(85_000 + s);
      const groups = Array.from({ length: r.int(0, 5) }, (_, g) => ({
        title: `Rayon ${g}`,
        items: Array.from({ length: r.int(0, 8) }, (_, k) => ({
          name: `article-${g}-${k}`,
          quantity: r.bool() ? `${r.int(1, 999)} g` : '',
          checked: r.bool(),
        })),
      }));
      const text = shoppingListAsText('Courses', groups);
      for (const it of groups.flatMap((g) => g.items))
        check(text.includes(it.name), `seed ${s}: ${it.name}`).toBe(!it.checked);
    }
  });
});

afterAll(() => console.info(`QA-COUNT mobile.fuzz.cases ${casesRun()}`));
