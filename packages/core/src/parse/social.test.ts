import { describe, expect, it } from 'vitest';
import {
  captionTitle,
  instagramCaption,
  tiktokCaption,
  unflattenCaption,
  youtubeDescription,
} from './social';
import { importFromUrl, type FetchPage } from './url';

/** Real caption of a public TikTok recipe (line breaks removed by TikTok, as served). */
const ONION_PASTA =
  'Pâtes aux oignons 🧅 Cette recette est facile et surtout trèèèèès réconfortante ! J’ai adoré et c’est certain j’en referai ❤️‍🔥 Let’s go ! 👩🏻‍🍳 Ingrédients pour 2 personnes :  -2 oignons blancs -200g de pâtes -20cl de crème  -20cl de vin blanc  -20cl de bouillon  -20g de beurre -Fromage râpé  1.Couper les oignons finement et les faire caraméliser avec le beurre dans une poêle a feu moyen. Au bout de 20min les oignons vont changer de couleur. 2.Ajouter le vin blanc et mélanger.  3.Quand le vin blanc est évaporé, ajouter le bouillon. 4.Quand le bouillon à réduit, ajouter la crème, mélanger et ajouter les pâtes. 5.Terminer avec du fromage râpé, et c’est prêt ! 😋 #pates #pasta #oignons #recette ';

const tiktokPage = (desc: string) =>
  `<html><head></head><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(
    {
      __DEFAULT_SCOPE__: {
        'webapp.video-detail': {
          itemInfo: {
            itemStruct: {
              desc,
              author: { nickname: 'Guillaumine', uniqueId: 'guillauminetherond' },
              video: { cover: 'https://p16.tiktokcdn.com/cover.jpg' },
            },
          },
        },
      },
    },
  )}</script></body></html>`;

function fake(pages: Record<string, { body: string; contentType?: string }>): FetchPage {
  return async (url) => {
    const p = pages[url];
    return p
      ? { status: 200, contentType: p.contentType ?? 'text/html', body: p.body }
      : { status: 404, contentType: 'text/html', body: '' };
  };
}

describe('social captions', () => {
  it('rebuilds the lines of a caption flattened by TikTok', () => {
    const lines = unflattenCaption(ONION_PASTA).split('\n');
    expect(lines).toContain('Ingrédients pour 2 personnes :');
    expect(lines).toContain('- 200g de pâtes');
    expect(lines).toContain('2. Ajouter le vin blanc et mélanger.');
    expect(lines.at(-1)).toBe('#pates #pasta #oignons #recette');
    // Captions that already have line breaks are left alone.
    expect(unflattenCaption('Crêpes\n250 g de farine\n3 œufs\n50 cl de lait')).toBe(
      'Crêpes\n250 g de farine\n3 œufs\n50 cl de lait',
    );
  });

  it('extracts a clean title', () => {
    expect(captionTitle(ONION_PASTA)).toBe('Pâtes aux oignons');
    expect(
      captionTitle(
        'Réponse à @Emma Pâtes crémeuses aux carottes (petit budget): INGRÉDIENTS: •Des pâtes',
      ),
    ).toBe('Pâtes crémeuses aux carottes (petit budget)');
    expect(captionTitle('#food #yum')).toBeNull();
  });

  it('reads the caption embedded in TikTok, YouTube and Instagram pages', () => {
    expect(tiktokCaption(tiktokPage('Salade 🥗'))).toEqual({
      caption: 'Salade 🥗',
      author: 'Guillaumine',
      image: 'https://p16.tiktokcdn.com/cover.jpg',
    });
    expect(tiktokCaption('<html>login</html>')).toBeNull();
    expect(
      youtubeDescription(
        'var x = {"videoDetails":{"shortDescription":"Crêpes\\n250 g de farine"}};',
      ),
    ).toBe('Crêpes\n250 g de farine');
    expect(
      youtubeDescription('{"attributedDescription":{"content":"Pâte à crêpes 🥞\\n3 oeufs"}}'),
    ).toBe('Pâte à crêpes 🥞\n3 oeufs');
    expect(youtubeDescription('<html></html>')).toBeNull();
    expect(
      instagramCaption(
        '1,234 likes, 56 comments - chef on March 2, 2024: "Tarte 🍋\n200 g de farine".',
      ),
    ).toBe('Tarte 🍋\n200 g de farine');
    expect(instagramCaption('Just a description')).toBe('Just a description');
  });
});

describe('importing a video link', () => {
  it('TikTok: full recipe from the public video page', async () => {
    const url = 'https://www.tiktok.com/@guillauminetherond/video/7364048122395266337';
    const r = await importFromUrl(fake({ [url]: { body: tiktokPage(ONION_PASTA) } }), url);
    expect(r).toMatchObject({
      platform: 'tiktok',
      completeness: 'partial',
      draft: {
        title: 'Pâtes aux oignons',
        servings: 2,
        author: 'Guillaumine',
        imageUrl: 'https://p16.tiktokcdn.com/cover.jpg',
        sourceUrl: url,
      },
    });
    expect(r.draft.ingredients.map((i) => [i.quantity, i.unit, i.name])).toEqual([
      [2, null, 'oignons blancs'],
      [200, 'g', 'pâtes'],
      [20, 'cl', 'crème'],
      [20, 'cl', 'vin blanc'],
      [20, 'cl', 'bouillon'],
      [20, 'g', 'beurre'],
      [null, null, 'Fromage râpé'],
    ]);
    expect(r.draft.steps).toHaveLength(5);
    expect(r.draft.steps[1]!.text).toBe('Ajouter le vin blanc et mélanger.');
    expect(r.draft.tags).toEqual(expect.arrayContaining(['pates', 'recette']));
  });

  it('YouTube: title from oEmbed, ingredients from the description', async () => {
    const url = 'https://www.youtube.com/watch?v=0h8gRsfzIFA';
    const r = await importFromUrl(
      fake({
        [url]: {
          body: '{"attributedDescription":{"content":"La pâte à crêpes facile 🥞\\n250 g de farine\\n60 g de sucre\\n3 oeufs\\n400 ml de lait\\n#crepe #recette"}}',
        },
        [`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`]: {
          contentType: 'application/json',
          body: JSON.stringify({
            title: 'La pâte à crêpes facile et sans grumeaux',
            author_name: 'Chef',
            thumbnail_url: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
          }),
        },
      }),
      url,
    );
    expect(r.draft.title).toBe('La pâte à crêpes facile et sans grumeaux');
    expect(r.draft.ingredients.map((i) => i.name)).toEqual(['farine', 'sucre', 'oeufs', 'lait']);
    expect(r.draft.imageUrl).toBe('https://i.ytimg.com/vi/x/hqdefault.jpg');
  });

  it('a video page that cannot be read still gives a draft with the link', async () => {
    const r = await importFromUrl(fake({}), 'https://www.tiktok.com/@a/video/1');
    expect(r).toMatchObject({
      completeness: 'minimal',
      draft: { sourceUrl: 'https://www.tiktok.com/@a/video/1' },
    });
  });
});
