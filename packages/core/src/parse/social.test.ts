import { describe, expect, it } from 'vitest';
import {
  captionTitle,
  guessLanguage,
  instagramCaption,
  instagramVideoUrl,
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
      subtitles: null,
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

describe('importing an Instagram post', () => {
  const CAPTION =
    "🥧 Quiche sans pâte\n\nPour un moule de 24 cm (l'idéal)\n* 3 oeufs\n* 120 g de farine\n* 50 cl de lait\n* sel, poivre, muscade\n\nMélangez tout, versez dans le moule et enfournez à 180° pendant 45 min 😋\n\n📊 Pour 8 parts\n👩🏻‍💻 La recette imprimable sur www.example.fr\n#quiche #recette";
  const url = 'https://www.instagram.com/reel/DAbc123xyz/?igsh=abc';
  const esc = (t: string) => t.replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

  it('reads the caption from the public post page', async () => {
    const page = `<meta property="og:image" content="https://scontent.cdninstagram.com/a.jpg"><meta property="og:description" content="54 likes, 0 comments - chef le November 12, 2024: &quot;${esc(CAPTION)}&quot;.">`;
    const r = await importFromUrl(fake({ [url]: { body: page } }), url);
    expect(r.draft).toMatchObject({
      title: 'Quiche sans pâte',
      ovenTemperatureC: 180,
      imageUrl: 'https://scontent.cdninstagram.com/a.jpg',
    });
    expect(r.draft.ingredients.map((i) => i.name)).toEqual([
      'oeufs',
      'farine',
      'lait',
      'sel, poivre, muscade',
    ]);
    expect(r.draft.steps.map((s) => s.text)).toEqual([
      'Mélangez tout, versez dans le moule et enfournez à 180° pendant 45 min 😋',
    ]);
  });

  it('falls back to the embed page when the post page asks to log in', async () => {
    const embed = `<div class="Caption"><a class="CaptionUsername" href="x">chef</a><br /><br />${CAPTION.replace(/\n/g, '<br />')}<div class="CaptionComments"></div></div><img class="EmbeddedMediaImage" src="https://scontent.cdninstagram.com/b.jpg?x=1&amp;y=2">`;
    const r = await importFromUrl(
      fake({
        [url]: {
          body: '<meta property="og:description" content="Create an account or log in to Instagram">',
        },
        'https://www.instagram.com/p/DAbc123xyz/embed/captioned/': { body: embed },
      }),
      url,
    );
    expect(r.draft).toMatchObject({
      title: 'Quiche sans pâte',
      author: 'chef',
      imageUrl: 'https://scontent.cdninstagram.com/b.jpg?x=1&y=2',
    });
    expect(r.draft.ingredients).toHaveLength(4);
  });

  it('a private post keeps the link and says so', async () => {
    const r = await importFromUrl(fake({}), url);
    expect(r).toMatchObject({
      platform: 'instagram',
      completeness: 'minimal',
      draft: { sourceUrl: url },
    });
  });
});

describe('reels whose recipe is only said out loud', () => {
  it('finds the public video link in the post page and in the embed page', () => {
    expect(
      instagramVideoUrl(
        'x"video_versions":[{"type":101,"url":"https:\\/\\/scontent.cdninstagram.com\\/v.mp4?a=1&b=2"}]y',
      ),
    ).toBe('https://scontent.cdninstagram.com/v.mp4?a=1&b=2');
    expect(
      instagramVideoUrl(
        '{\\"video_url\\":\\"https:\\\\\\/\\\\\\/scontent.cdninstagram.com\\\\\\/v.mp4?x=1\\\\u0026y=2\\",',
      ),
    ).toBe('https://scontent.cdninstagram.com/v.mp4?x=1&y=2');
    expect(instagramVideoUrl('<html>no video</html>')).toBeNull();
  });

  it('guesses the language to listen in', () => {
    expect(guessLanguage('Les pâtes de ma grand-mère avec une sauce pour vous')).toBe('fr');
    expect(guessLanguage('The best pasta with a creamy sauce for you and the family')).toBe('en');
    expect(guessLanguage('La pasta della nonna con il sugo e che bontà per tutti')).toBe('it');
    expect(guessLanguage('🍝🍝')).toBeNull();
  });

  it('a reel without the recipe in its caption gives the video to listen to', async () => {
    const url = 'https://www.instagram.com/reel/DAbc123xyz/';
    const page =
      '<meta property="og:description" content="12 likes, 1 comments - chef le 1 mai 2026: &quot;Mes pâtes préférées de la semaine, regardez bien la vidéo pour tout savoir&quot;.">' +
      '"video_versions":[{"type":101,"url":"https:\\/\\/scontent.cdninstagram.com\\/r.mp4"}]';
    const r = await importFromUrl(fake({ [url]: { body: page } }), url);
    expect(r).toMatchObject({
      videoUrl: 'https://scontent.cdninstagram.com/r.mp4',
      language: 'fr',
      draft: {
        // The dish named in the caption, not the whole sentence.
        title: 'Pâtes préférées de la semaine',
      },
    });
    // With the recipe in the caption, there is nothing to listen to.
    const CAPTION_WITH_RECIPE =
      '…: &quot;Crêpes&#10;- 250 g de farine&#10;- 3 oeufs&#10;- 50 cl de lait&quot;.';
    const r2 = await importFromUrl(
      fake({ [url]: { body: page.replace(/: &quot;.*&quot;\./, CAPTION_WITH_RECIPE.slice(1)) } }),
      url,
    );
    expect(r2.draft.ingredients).toHaveLength(3);
    // Ingredients only, no steps: the video is listened to for them.
    expect(r2).toMatchObject({ videoUrl: 'https://scontent.cdninstagram.com/r.mp4', listen: true });
    // Ingredients and steps in the caption: the video only gives the photo.
    const FULL =
      '…: &quot;Crêpes&#10;- 250 g de farine&#10;- 3 oeufs&#10;- 50 cl de lait&#10;Préparation :&#10;1. Mélanger la farine et les oeufs.&#10;2. Ajouter le lait petit à petit.&#10;3. Cuire les crêpes à la poêle.&quot;.';
    const r3 = await importFromUrl(
      fake({ [url]: { body: page.replace(/: &quot;.*&quot;\./, FULL.slice(1)) } }),
      url,
    );
    expect(r3.draft.steps.length).toBeGreaterThan(0);
    expect(r3).toMatchObject({ listen: false });
  });
});

describe('regression: a reel shared from Instagram (hook as title, recipe in the notes)', () => {
  it('the dish as the title, ingredients and steps read, notes not cluttered', async () => {
    const url = 'https://www.instagram.com/reel/DPenne123/';
    const caption = [
      'Avec ces pennes au poulet je te jure tu vas te régaler 😍🔥',
      '',
      'Ingrédients pour 4 personnes 👇',
      '🍝 400 g de pennes',
      '🍗 2 escalopes de poulet',
      '🥛 20 cl de crème fraîche',
      '',
      'Préparation 👇',
      '1️⃣ Fais cuire les pennes dans l’eau bouillante salée.',
      '2️⃣ Coupe le poulet en morceaux et fais-le dorer.',
      '3️⃣ Ajoute la crème, laisse mijoter 5 min et mélange avec les pâtes.',
      '',
      '#pates #poulet',
    ].join('\n');
    const html = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
    const page = `<meta property="og:description" content="1 200 likes, 30 comments - chef le 1 mai 2026: &quot;${html(caption)}&quot;.">`;
    const r = await importFromUrl(fake({ [url]: { body: page } }), url);
    expect(r.draft.title).toBe('Pennes au poulet');
    expect(r.draft.ingredients.map((i) => i.name)).toEqual([
      'pennes',
      'escalopes de poulet',
      'crème fraîche',
    ]);
    expect(r.draft.steps).toHaveLength(3);
    expect(r.draft.notes ?? '').not.toContain('Fais cuire');
  });
});
