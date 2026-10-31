/**
 * Recipe pages of the big recipe sites, reduced to the structured data they publish (same shapes,
 * quirks included: type arrays, @graph, HowToSection, ImageObject, entities, yields as arrays).
 */
import { describe, expect, it } from 'vitest';
import { importFromUrl, pinterestSourceUrl, type FetchPage } from './url';

const page = (ld: unknown, head = '') =>
  `<html><head>${head}<script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;

const SITES: Record<string, string> = {
  'https://www.marmiton.org/recettes/recette_gratin-dauphinois_16708.aspx': page({
    '@context': 'http://schema.org',
    '@type': 'Recipe',
    name: 'Gratin dauphinois',
    image: ['https://assets.afcdn.com/recipe/gratin.jpg'],
    recipeYield: '6 personnes',
    prepTime: 'PT20M',
    cookTime: 'PT1H',
    totalTime: 'PT1H20M',
    recipeIngredient: [
      '1,5 kg de pommes de terre',
      '50 cl de crème fraîche',
      '2 gousses d&#039;ail',
    ],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Éplucher et trancher les pommes de terre.' },
      { '@type': 'HowToStep', text: 'Cuire 1 h à 160°C.' },
    ],
    author: 'Marmiton',
  }),
  'https://www.750g.com/tarte-aux-pommes-r12345.htm': page({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: '750g' },
      {
        '@type': 'Recipe',
        name: 'Tarte aux pommes',
        image: { '@type': 'ImageObject', url: 'https://static.750g.com/tarte.jpg' },
        recipeYield: '8',
        recipeIngredient: ['1 pâte brisée', '5 pommes', '30 g de beurre'],
        recipeInstructions: [{ '@type': 'HowToStep', name: 'Étape 1', text: 'Étaler la pâte.' }],
      },
    ],
  }),
  'https://www.cuisineaz.com/recettes/ratatouille-1234.aspx': page({
    '@context': 'http://schema.org/',
    '@type': 'Recipe',
    name: 'Ratatouille',
    recipeYield: '4 personne(s)',
    recipeIngredient: ['2 aubergines', '3 courgettes'],
    recipeInstructions: '1. Couper les légumes.\n2. Faire revenir 10 min.\n3. Mijoter 30 min.',
  }),
  'https://www.ricardocuisine.com/recettes/1234-pate-chinois': page({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Pâté chinois',
    recipeYield: '6 portions',
    recipeIngredient: ['450 g (1 lb) de bœuf haché', '1 boîte de maïs en crème'],
    recipeInstructions: [
      {
        '@type': 'HowToSection',
        name: 'Purée',
        itemListElement: [{ '@type': 'HowToStep', text: 'Cuire les pommes de terre.' }],
      },
      {
        '@type': 'HowToSection',
        name: 'Montage',
        itemListElement: [{ '@type': 'HowToStep', text: 'Étager bœuf, maïs et purée.' }],
      },
    ],
  }),
  'https://www.bbcgoodfood.com/recipes/easy-chicken-curry': page({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Easy chicken curry',
    image: { '@type': 'ImageObject', url: 'https://images.immediate.co.uk/curry.jpg', width: 440 },
    recipeYield: 4,
    recipeIngredient: ['2 tbsp sunflower oil', '1 onion, chopped', '400g can chopped tomatoes'],
    recipeInstructions: [
      { '@type': 'HowToStep', text: '<p>Heat the oil and fry the onion for 5 mins.</p>' },
    ],
    author: { '@type': 'Person', name: 'Good Food team' },
  }),
  'https://www.allrecipes.com/recipe/12345/banana-bread/': page([
    {
      '@context': 'http://schema.org',
      '@type': ['Recipe', 'NewsArticle'],
      headline: 'Banana Banana Bread',
      name: 'Banana Banana Bread',
      image: [{ '@type': 'ImageObject', url: 'https://www.allrecipes.com/thmb/bread.jpg' }],
      recipeYield: ['12', '1 loaf'],
      recipeIngredient: ['2 cups all-purpose flour', '1 teaspoon baking soda', '½ cup butter'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Bake for 60 to 65 minutes.' }],
      author: [{ '@type': 'Person', name: 'Shelley Albeluhn' }],
    },
  ]),
  'https://cooking.nytimes.com/recipes/1234-pasta-al-limone': page({
    '@context': 'http://schema.org',
    '@type': 'Recipe',
    name: 'Pasta al Limone',
    image: [{ '@type': 'ImageObject', url: 'https://static01.nyt.com/limone.jpg' }],
    recipeYield: '4 servings',
    totalTime: 'PT20M',
    recipeIngredient: ['Salt', '1 pound spaghetti', '2 lemons'],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Bring a large pot of salted water to a boil.' },
      { '@type': 'HowToStep', text: 'Toss the pasta with the lemon &amp; butter.' },
    ],
    author: { '@type': 'Person', name: 'Ali Slagle' },
  }),
};

const fetchFrom =
  (pages: Record<string, string>): FetchPage =>
  async (url) =>
    pages[url]
      ? { status: 200, contentType: 'text/html; charset=utf-8', body: pages[url]! }
      : { status: 404, contentType: 'text/html', body: '' };

describe('big recipe sites', () => {
  it.each(Object.keys(SITES))('%s gives a full recipe', async (url) => {
    const r = await importFromUrl(fetchFrom(SITES), url);
    expect(r.completeness).toBe('full');
    expect(r.draft.title).toBeTruthy();
    expect(r.draft.ingredients.length).toBeGreaterThan(0);
    expect(r.draft.steps.length).toBeGreaterThan(0);
    expect(r.draft.sourceUrl).toBe(url);
  });

  it('reads each site’s quirks', async () => {
    const get = async (u: string) => (await importFromUrl(fetchFrom(SITES), u)).draft;
    const marmiton = await get(Object.keys(SITES)[0]!);
    expect(marmiton.servings).toBe(6);
    expect(marmiton.ingredients[2]!.name).toBe('ail');
    expect(marmiton.totalMinutes).toBe(80);
    const cuisineaz = await get(Object.keys(SITES)[2]!);
    expect(cuisineaz.steps.map((s) => s.text)).toEqual([
      'Couper les légumes.',
      'Faire revenir 10 min.',
      'Mijoter 30 min.',
    ]);
    const ricardo = await get(Object.keys(SITES)[3]!);
    expect(ricardo.steps.map((s) => s.group)).toEqual(['Purée', 'Montage']);
    const bbc = await get(Object.keys(SITES)[4]!);
    expect(bbc.imageUrl).toBe('https://images.immediate.co.uk/curry.jpg');
    expect(bbc.steps[0]!.text).toBe('Heat the oil and fry the onion for 5 mins.');
    expect(bbc.author).toBe('Good Food team');
    const allrecipes = await get(Object.keys(SITES)[5]!);
    expect(allrecipes.servings).toBe(12);
    expect(allrecipes.author).toBe('Shelley Albeluhn');
    const nyt = await get(Object.keys(SITES)[6]!);
    expect(nyt.steps[1]!.text).toBe('Toss the pasta with the lemon & butter.');
    expect(nyt.servings).toBe(4);
  });
});

describe('Pinterest', () => {
  const origin = 'https://cooking.nytimes.com/recipes/1234-pasta-al-limone';
  const pin = `<html><head><meta property="og:title" content="Pasta al limone"><meta property="og:description" content="Easy lemon pasta"></head><body><script id="__PWS_DATA__" type="application/json">{"props":{"pin":{"images":{"orig":{"url":"https:\\/\\/i.pinimg.com\\/originals\\/a.jpg"}},"link":"https:\\/\\/cooking.nytimes.com\\/recipes\\/1234-pasta-al-limone","domain":"cooking.nytimes.com"}}}</script></body></html>`;

  it('finds the page a pin was saved from', () => {
    expect(pinterestSourceUrl(pin)).toBe(origin);
    expect(
      pinterestSourceUrl('<meta property="og:see_also" content="https://www.750g.com/a.htm">'),
    ).toBe('https://www.750g.com/a.htm');
    expect(
      pinterestSourceUrl('{"link":"https:\\u002F\\u002Fwww.pinterest.com\\u002Fpin\\u002F1"}'),
    ).toBeNull();
  });

  it('imports the recipe from the original site (pin.it short links too)', async () => {
    const pages = { ...SITES, 'https://pin.it/3xYz': pin, 'https://www.pinterest.fr/pin/42/': pin };
    for (const url of ['https://pin.it/3xYz', 'https://www.pinterest.fr/pin/42/']) {
      const r = await importFromUrl(fetchFrom(pages), url);
      expect(r.completeness).toBe('full');
      expect(r.draft.title).toBe('Pasta al Limone');
      expect(r.draft.sourceUrl).toBe(origin);
    }
  });

  it('keeps the pin itself when the original page cannot be read', async () => {
    const r = await importFromUrl(fetchFrom({ 'https://pin.it/3xYz': pin }), 'https://pin.it/3xYz');
    expect(r.platform).toBe('pinterest');
    expect(r.draft.title).toBe('Pasta al limone');
  });
});

describe('Pinterest: the pin’s public data (regression: only the title was imported)', () => {
  // Shape of widgets.pinterest.com/v3/pidgets/pins/info for a real Marmiton video pin whose
  // recipe is in the description and whose link is an Instagram profile.
  const INFO = {
    status: 'success',
    data: [
      {
        id: '90705379991978745',
        link: 'https://www.instagram.com/marmiton_org/reels/',
        description:
          "Crispy Rice Tuna Burger &#10084;&#65039;\nEt si on rempla&#231;ait le pain de ton burger par du riz ultra-croustillant ? &#127843;&#127828; \nAttends de voir ce que &#231;a donne !\nIngr&#233;dients : \nPour le riz croustillant : \n500 g de riz &#224; sushi fra&#238;chement cuit\n45 g de vinaigre de riz\n25 g de sucre blanc\n5 g de sel\nHuile neutre pour la friture\nPour la garniture\n200 g de thon rouge gras (qualit&#233; adapt&#233;e &#224; une consommation crue)\n1 citron vert\n50 g de ciboule ou d'oignon nouveau finement &#233;minc&#233;\n2 avocats\n4 &#224; 5 g de sel\nPour la sauce\n30 g de sauce soja l&#233;g&#232;re\n7 &#224; 8 g de jus de citron vert\n7 g de miel\n5 g de wasabi",
        images: {
          '236x': {
            width: 236,
            height: 419,
            url: 'https://i.pinimg.com/236x/f1/ec/4d/f1ec4d9fbcee8cca42fe130168b61f41.jpg',
          },
          '237x': {
            width: 236,
            height: 419,
            url: 'https://i.pinimg.com/236x/f1/ec/4d/f1ec4d9fbcee8cca42fe130168b61f41.jpg',
          },
          '564x': {
            width: 564,
            height: 1002,
            url: 'https://i.pinimg.com/564x/f1/ec/4d/f1ec4d9fbcee8cca42fe130168b61f41.jpg',
          },
        },
        pinner: { full_name: 'Marmiton' },
        videos: {
          video_list: {
            V_HLSV4: {
              url: 'https://v1.pinimg.com/videos/iht/hls/a4/22/5a/a4225aec5949e6260366401151135fdc.m3u8',
              width: 1080,
              height: 1920,
              duration: 67800.0,
              thumbnail:
                'https://i.pinimg.com/videos/thumbnails/originals/a4/22/5a/a4225aec5949e6260366401151135fdc.0000000.jpg',
            },
            V_720P: {
              url: 'https://v1.pinimg.com/videos/iht/expMp4/a4/22/5a/a4225aec5949e6260366401151135fdc_720w.mp4',
              width: 1080,
              height: 1920,
              duration: 67800.0,
              thumbnail:
                'https://i.pinimg.com/videos/thumbnails/originals/a4/22/5a/a4225aec5949e6260366401151135fdc.0000000.jpg',
            },
          },
          id: '5526834726417079238',
        },
        story_pin_data: null,
      },
    ],
  };
  const api = 'https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=90705379991978745';

  it('reads the recipe written in the description, the large picture and the video', async () => {
    const r = await importFromUrl(
      fetchFrom({ [api]: JSON.stringify(INFO) }),
      'https://www.pinterest.com/pin/90705379991978745/',
    );
    expect(r.platform).toBe('pinterest');
    expect(r.draft.title).toBe('Crispy Rice Tuna Burger');
    expect(r.draft.ingredients.length).toBeGreaterThan(10);
    expect(r.draft.ingredients[0]).toMatchObject({ quantity: 500, unit: 'g' });
    expect(r.draft.imageUrl).toContain('/564x/');
    expect(r.videoUrl).toMatch(/\.mp4$/);
    // No steps in the description: the video is listened to for them.
    expect(r.listen).toBe(true);
  });

  it('a pin saved from a recipe site gives that site’s recipe (link with &amp;)', async () => {
    const origin = 'https://cooking.nytimes.com/recipes/1234-pasta-al-limone';
    const pin = {
      ...INFO.data[0],
      link: `${origin}?utm_source=pinterest&amp;utm_medium=social`,
      videos: null,
    };
    const r = await importFromUrl(
      fetchFrom({
        ...SITES,
        [`${origin}?utm_source=pinterest&utm_medium=social`]: SITES[origin]!,
        [api]: JSON.stringify({ data: [pin] }),
      }),
      'https://www.pinterest.fr/pin/titre-de-la-recette--90705379991978745/',
    );
    expect(r.completeness).toBe('full');
    expect(r.draft.title).toBe('Pasta al Limone');
  });

  it('a pin.it short link: the pin number is found in the page', async () => {
    const page = '<link rel="canonical" href="https://www.pinterest.com/pin/90705379991978745/">';
    const r = await importFromUrl(
      fetchFrom({ 'https://pin.it/AbC': page, [api]: JSON.stringify(INFO) }),
      'https://pin.it/AbC',
    );
    expect(r.draft.ingredients.length).toBeGreaterThan(10);
  });
});
