/** Fuzz and property tests of the importers: whatever comes in, nothing throws and the output is valid. */
import { afterAll, describe, expect, it } from 'vitest';
import { parseIngredientLine } from '../parse/ingredient';
import { parseRecipeText } from '../parse/text';
import { parseJsonLdRecipe, parseHtmlMeta } from '../parse/jsonld';
import { ingredientsFromScreenText, mergeIngredients } from '../parse/onscreen';
import { recipeFromTranscript } from '../parse/transcript';
import { extractUrls, instagramSavedPosts } from '../parse/links';
import {
  captionTitle,
  guessLanguage,
  instagramCaption,
  instagramVideoUrl,
  tiktokCaption,
  unflattenCaption,
  youtubeDescription,
  youtubeSubtitles,
} from '../parse/social';
import {
  importFromUrl,
  ImportUrlError,
  normalizeImportUrl,
  pinterestSourceUrl,
} from '../parse/url';
import { ingredientKey } from '../text';
import { casesRun, rng } from './rng';

const N = 600;

function validIngredient(i: ReturnType<typeof parseIngredientLine>, seed: number) {
  if (!i) return;
  const m = `seed ${seed}: ${JSON.stringify(i)}`;
  expect(typeof i.name, m).toBe('string');
  expect(i.name.length, m).toBeGreaterThan(0);
  expect(i.name, m).toBe(i.name.trim());
  if (i.quantity !== null) {
    expect(Number.isFinite(i.quantity), m).toBe(true);
    expect(i.quantity, m).toBeGreaterThanOrEqual(0);
  }
  if (i.quantityMax !== null) {
    expect(Number.isFinite(i.quantityMax), m).toBe(true);
    expect(i.quantity, m).not.toBeNull();
  }
}

describe('ingredient lines', () => {
  it(`${N} random lines never throw and give a valid ingredient or null`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(s);
      const line = r.junk(12);
      validIngredient(parseIngredientLine(line), s);
    }
  });

  it(`${N} generated "quantity unit name" lines are read back exactly`, () => {
    const units = ['g', 'kg', 'ml', 'cl', 'l'];
    const names = ['farine', 'sucre', 'lait', 'beurre doux', 'pommes de terre', 'crème fraîche'];
    for (let s = 1; s <= N; s++) {
      const r = rng(1000 + s);
      const q = r.bool() ? r.int(1, 2000) : r.int(1, 99) + r.int(1, 9) / 10;
      const unit = r.pick(units);
      const name = r.pick(names);
      const text = `${String(q).replace('.', r.bool() ? ',' : '.')} ${unit} ${r.bool() ? 'de ' : ''}${name}`;
      const p = parseIngredientLine(text);
      expect(p, `seed ${s}: ${text}`).not.toBeNull();
      expect(p!.quantity, `seed ${s}: ${text}`).toBeCloseTo(q, 6);
      expect(p!.unit, `seed ${s}: ${text}`).toBe(unit);
      expect(ingredientKey(p!.name), `seed ${s}: ${text}`).toBe(ingredientKey(name));
    }
  });

  it(`${N} names: the merge key is stable (key of a key is the key)`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(2000 + s);
      const name = r.junk(5);
      const k = ingredientKey(name);
      expect(ingredientKey(k), `seed ${s}: ${JSON.stringify(name)} → ${k}`).toBe(k);
    }
  });
});

describe('recipe texts', () => {
  it(`${N} random texts give a draft with only non-empty, trimmed parts`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(3000 + s);
      const lines = Array.from({ length: r.int(0, 30) }, () =>
        r.pick([
          () => r.junk(10),
          () => r.pick(['Ingrédients', 'INGREDIENTS :', 'Préparation', 'Steps', 'Étapes :']),
          () => `${r.int(1, 12)}. ${r.junk(8)}`,
          () => `- ${r.int(1, 500)} g ${r.word()}`,
          () => `Pour ${r.int(1, 12)} personnes`,
          () => `Cuisson : ${r.int(1, 90)} min`,
        ])(),
      );
      const d = parseRecipeText(lines.join(r.pick(['\n', '\r\n', '\n\n'])));
      const m = `seed ${s}`;
      for (const i of d.ingredients) validIngredient(i, s);
      for (const st of d.steps) {
        expect(st.text.trim().length, m).toBeGreaterThan(0);
        if (st.timerSeconds !== null) expect(st.timerSeconds, m).toBeGreaterThan(0);
      }
      if (d.servings !== null) expect(d.servings, m).toBeGreaterThan(0);
      if (d.title !== null) expect(d.title.length, m).toBeLessThanOrEqual(200);
    }
  });

  it(`${N} transcripts and on-screen texts never throw; merge adds no duplicates`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(4000 + s);
      const said = Array.from({ length: r.int(0, 15) }, () => r.junk(12));
      const t = recipeFromTranscript(said);
      for (const i of t.ingredients) validIngredient(i, s);
      const frames = Array.from({ length: r.int(0, 8) }, () =>
        Array.from({ length: r.int(0, 6) }, () =>
          r.bool() ? `${r.int(1, 900)} g ${r.word()}` : r.junk(6),
        ),
      );
      const seen = ingredientsFromScreenText(frames);
      const merged = mergeIngredients(t.ingredients, seen);
      const keys = merged.map((i) => ingredientKey(i.name));
      expect(new Set(keys).size, `seed ${s}`).toBe(
        keys.length -
          (t.ingredients.length - new Set(t.ingredients.map((i) => ingredientKey(i.name))).size),
      );
      expect(merged.length, `seed ${s}`).toBeGreaterThanOrEqual(t.ingredients.length);
    }
  });
});

describe('web pages', () => {
  const html = (r: ReturnType<typeof rng>) => {
    const parts = [
      () => `<script type="application/ld+json">${r.junk(30)}</script>`,
      () =>
        `<script type="application/ld+json">${JSON.stringify({
          '@context': 'https://schema.org',
          '@type': r.pick(['Recipe', ['Recipe', 'NewsArticle'], 'WebPage']),
          name: r.bool() ? r.junk(6) : r.int(0, 9),
          recipeIngredient: r.bool()
            ? Array.from({ length: r.int(0, 8) }, () => r.junk(6))
            : r.junk(5),
          recipeInstructions: r.pick([
            () => r.junk(20),
            () =>
              Array.from({ length: r.int(0, 5) }, () => ({
                '@type': 'HowToStep',
                text: r.junk(8),
              })),
            () => [
              { '@type': 'HowToSection', name: r.word(), itemListElement: [{ text: r.junk(5) }] },
            ],
            () => null,
          ])(),
          recipeYield: r.pick([r.int(-5, 500), r.junk(3), [r.junk(2), r.int(0, 9)], null]),
          totalTime: r.pick(['PT1H30M', 'P1DT2H', 'PTM', r.junk(3), null]),
          image: r.pick([r.junk(3), { url: 'https://x.y/z.jpg' }, ['javascript:alert(1)'], null]),
        })}</script>`,
      () =>
        `<meta property="og:${r.pick(['title', 'description', 'image', 'site_name'])}" content="${r.junk(10).replace(/"/g, '')}">`,
      () => r.junk(20),
    ];
    return `<html><head>${Array.from({ length: r.int(0, 6) }, () => r.pick(parts)()).join('')}</head></html>`;
  };

  it(`${N} random pages: structured data and meta never throw, images are http(s) only`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(5000 + s);
      const page = html(r);
      const d = parseJsonLdRecipe(page);
      if (d) {
        for (const i of d.ingredients) validIngredient(i, s);
        if (d.imageUrl) expect(d.imageUrl, `seed ${s}`).toMatch(/^https?:\/\//i);
        if (d.servings !== null) expect(d.servings, `seed ${s}`).toBeGreaterThan(0);
        for (const st of d.steps) expect(st.text.length, `seed ${s}`).toBeGreaterThan(0);
      }
      const meta = parseHtmlMeta(page);
      expect(typeof meta, `seed ${s}`).toBe('object');
      // Social parsers on the same garbage.
      tiktokCaption(page);
      youtubeDescription(page);
      youtubeSubtitles(page);
      instagramVideoUrl(page);
      pinterestSourceUrl(page);
      const cap = instagramCaption(r.junk(20));
      unflattenCaption(cap);
      captionTitle(cap);
      guessLanguage(cap);
    }
  });

  it(`${N} random fetch outcomes: an import never throws for a valid link and keeps the link`, async () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(6000 + s);
      const url = r.pick([
        'https://www.marmiton.org/recettes/x.aspx',
        'https://www.instagram.com/reel/ABC123/',
        'https://vm.tiktok.com/ZM123/',
        'https://youtu.be/abc',
        'https://pin.it/xyz',
        'https://www.pinterest.fr/pin/1/',
        'https://fb.watch/x/',
        'http://example.com/a?b=c#d',
      ]);
      const res = await importFromUrl(async () => {
        const kind = r.int(0, 3);
        if (kind === 0) throw new Error('offline');
        return {
          status: r.pick([200, 200, 200, 301, 404, 429, 500]),
          contentType: r.pick(['text/html', 'application/json', null, 'image/png']),
          body: r.bool() ? html(r) : r.junk(40),
        };
      }, url);
      expect(res.draft.sourceUrl, `seed ${s}`).toBeTruthy();
      expect(['full', 'partial', 'minimal'], `seed ${s}`).toContain(res.completeness);
    }
  });

  it(`${N} random strings: links are extracted or rejected cleanly`, () => {
    for (let s = 1; s <= N; s++) {
      const r = rng(7000 + s);
      const text = r.bool()
        ? `${r.junk(8)} https://${r.word(6)}.com/${r.word(4)} ${r.junk(8)}`
        : r.junk(15);
      for (const u of extractUrls(text)) expect(u, `seed ${s}`).toMatch(/^https?:\/\//);
      try {
        const u = normalizeImportUrl(text);
        expect(['http:', 'https:'], `seed ${s}`).toContain(u.protocol);
      } catch (e) {
        expect(e, `seed ${s}`).toBeInstanceOf(ImportUrlError);
      }
      instagramSavedPosts([
        {
          name: r.pick(['saved_posts.json', 'x.json']),
          text: r.bool()
            ? r.junk(30)
            : JSON.stringify({
                saved_saved_media: [
                  {
                    title: r.word(),
                    string_map_data: {
                      'Saved on': { href: `https://www.instagram.com/p/${r.word(5)}/` },
                    },
                  },
                ],
              }),
        },
      ]);
    }
  });
});

afterAll(() => console.info(`QA-COUNT core.fuzz.parsers.cases ${casesRun()}`));
