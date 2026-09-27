import { describe, expect, it } from 'vitest';
import { extractJsonLdBlocks, parseHtmlMeta, parseJsonLdRecipe } from './jsonld';

const page = (ld: unknown, extra = '') =>
  `<html><head><title>T</title>${extra}<script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;

describe('JSON-LD recipe import', () => {
  it('parses a standard schema.org Recipe', () => {
    const d = parseJsonLdRecipe(
      page({
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        name: 'Blanquette de veau',
        description: 'Un classique &amp; réconfortant',
        image: ['https://example.com/a.jpg'],
        recipeYield: '6 personnes',
        prepTime: 'PT30M',
        cookTime: 'PT2H',
        totalTime: 'PT2H30M',
        recipeIngredient: ['1,2 kg de veau', '2 carottes', '20 cl de crème fraîche'],
        recipeInstructions: [
          { '@type': 'HowToStep', text: 'Couper la viande.' },
          { '@type': 'HowToStep', text: 'Laisser mijoter 2 heures.' },
        ],
        keywords: 'veau, plat mijoté',
        author: { '@type': 'Person', name: 'Julie' },
      }),
    )!;
    expect(d.title).toBe('Blanquette de veau');
    expect(d.description).toBe('Un classique & réconfortant');
    expect(d.imageUrl).toBe('https://example.com/a.jpg');
    expect(d.servings).toBe(6);
    expect([d.prepMinutes, d.cookMinutes, d.totalMinutes]).toEqual([30, 120, 150]);
    expect(d.ingredients[0]).toMatchObject({ quantity: 1.2, unit: 'kg', name: 'veau' });
    expect(d.steps[1]).toMatchObject({ text: 'Laisser mijoter 2 heures.', timerSeconds: 7200 });
    expect(d.tags).toEqual(['veau', 'plat mijoté']);
    expect(d.author).toBe('Julie');
  });

  it('finds recipes inside @graph and handles HowToSection and type arrays', () => {
    const d = parseJsonLdRecipe(
      page({
        '@graph': [
          { '@type': 'WebSite', name: 'x' },
          {
            '@type': ['Recipe', 'Thing'],
            name: 'Cake',
            recipeYield: [8, '8 slices'],
            recipeInstructions: [
              {
                '@type': 'HowToSection',
                name: 'Batter',
                itemListElement: [{ '@type': 'HowToStep', text: 'Mix.' }],
              },
              {
                '@type': 'HowToSection',
                name: 'Bake',
                itemListElement: [{ '@type': 'HowToStep', text: 'Bake 30 min.' }],
              },
            ],
            image: { '@type': 'ImageObject', url: 'https://x.test/c.png' },
          },
        ],
      }),
    )!;
    expect(d.servings).toBe(8);
    expect(d.steps.map((s) => s.group)).toEqual(['Batter', 'Bake']);
    expect(d.imageUrl).toBe('https://x.test/c.png');
  });

  it('string instructions are split into steps', () => {
    const d = parseJsonLdRecipe(
      page({
        '@type': 'Recipe',
        name: 'A',
        recipeInstructions: '<p>1. Do this.</p><br>2. Do that.',
      }),
    )!;
    expect(d.steps.map((s) => s.text)).toEqual(['Do this.', 'Do that.']);
  });

  it('returns null without recipe; tolerates broken JSON', () => {
    expect(parseJsonLdRecipe('<html></html>')).toBeNull();
    expect(parseJsonLdRecipe('<script type="application/ld+json">{broken</script>')).toBeNull();
    expect(
      extractJsonLdBlocks('<script type="application/ld+json">{"a":"b\nc"}</script>'),
    ).toHaveLength(1);
  });

  it('rejects non-http image urls', () => {
    const d = parseJsonLdRecipe(
      page({ '@type': 'Recipe', name: 'A', image: 'javascript:alert(1)' }),
    )!;
    expect(d.imageUrl).toBeNull();
  });

  it('reads OpenGraph meta', () => {
    const m = parseHtmlMeta(
      '<meta property="og:title" content="Pâtes &amp; co"><meta content="https://i.test/x.jpg" property="og:image"><meta name="description" content="Desc">',
    );
    expect(m).toMatchObject({
      title: 'Pâtes & co',
      image: 'https://i.test/x.jpg',
      description: 'Desc',
    });
  });
});
