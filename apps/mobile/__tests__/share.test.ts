// Native pieces (iCloud, files, speech, photos) are not needed to decide what to import.
jest.mock('../src/services/runtime', () => ({ runtime: { session: null } }));
jest.mock('../src/services/importer', () => ({}));
jest.mock('../src/services/ocr', () => ({}));
jest.mock('../src/services/photos', () => ({}));
jest.mock('../src/services/videoFrames', () => ({}));
jest.mock('../modules/pdf-text', () => ({}));

import { draftFromDictation, sourcesFromShare } from '../src/services/autoImport';
import { formatIngredient, shoppingListAsText } from '../src/lib/format';
import { pickFrames } from '../src/lib/frames';

const share = (p: Partial<Parameters<typeof sourcesFromShare>[0]>) =>
  sourcesFromShare({ text: null, url: null, title: null, images: [], videos: [], ...p });

describe('what is shared becomes imports', () => {
  it('a reel link with its caption is one import', () => {
    expect(
      share({
        url: 'https://www.instagram.com/reel/ABC/',
        text: 'Pâtes crémeuses https://www.instagram.com/reel/ABC/',
      }),
    ).toEqual([
      {
        kind: 'link',
        url: 'https://www.instagram.com/reel/ABC/',
        text: 'Pâtes crémeuses https://www.instagram.com/reel/ABC/',
        title: null,
      },
    ]);
  });
  it('several links in a text are several imports', () => {
    const s = share({
      text: 'https://www.tiktok.com/@a/video/1\nhttps://www.instagram.com/p/XYZ/\nhttps://www.tiktok.com/@a/video/1',
    });
    expect(s.map((x) => x.kind === 'link' && x.url)).toEqual([
      'https://www.tiktok.com/@a/video/1',
      'https://www.instagram.com/p/XYZ/',
    ]);
  });
  it('screenshots make one recipe, a video is listened to, plain text is parsed', () => {
    expect(share({ images: ['file:///1.jpg', 'file:///2.jpg'] })).toEqual([
      { kind: 'photos', uris: ['file:///1.jpg', 'file:///2.jpg'] },
    ]);
    expect(share({ videos: ['file:///v.mp4'], text: 'Recette' })).toEqual([
      { kind: 'video', uri: 'file:///v.mp4', text: 'Recette' },
    ]);
    expect(share({ pdfs: ['file:///r.pdf'], text: 'Recette' })).toEqual([
      { kind: 'pdf', uri: 'file:///r.pdf' },
    ]);
    expect(share({ text: 'Crêpes\n250 g de farine' })[0]).toMatchObject({ kind: 'text' });
    expect(share({})).toEqual([]);
  });
});

describe('dictation', () => {
  it('the first sentence is the name, then ingredients and steps', () => {
    const d = draftFromDictation([
      'Gâteau au yaourt.',
      'Il faut 3 œufs, 200 grammes de farine et 1 yaourt nature',
      'Mélangez les œufs avec le sucre',
      'Faites cuire 30 minutes à 180 degrés',
    ]);
    expect(d.title).toBe('Gâteau au yaourt');
    expect(d.ingredients.map((i) => i.name)).toEqual(
      expect.arrayContaining([expect.stringMatching(/farine/i)]),
    );
    expect(d.steps.length).toBeGreaterThan(0);
    expect(d.notes).toContain('🎙️');
  });
});

describe('smart scaling in the ingredient list', () => {
  const egg = {
    id: 'e',
    group: null,
    name: 'œufs',
    quantity: 2,
    quantityMax: null,
    unit: null,
    note: null,
  };
  it('whole eggs, marked as rounded', () => {
    expect(formatIngredient(egg, 4 / 6, 'fr', 'metric').amount).toBe('≈ 1');
    expect(formatIngredient(egg, 1.5, 'fr', 'metric').amount).toBe('3');
  });
  it('cups of flour in grams for metric users', () => {
    const flour = { ...egg, name: 'all-purpose flour', quantity: 1, unit: 'cup' };
    expect(formatIngredient(flour, 1, 'fr', 'metric').amount).toBe('127 g');
  });
});

describe('shopping list as text', () => {
  it('lists what is left to buy, by aisle', () => {
    expect(
      shoppingListAsText('Courses', [
        {
          title: 'Fruits & légumes',
          items: [{ name: 'Tomates', quantity: '1 kg', checked: false }],
        },
        { title: 'Épicerie', items: [{ name: 'Riz', quantity: '', checked: true }] },
      ]),
    ).toBe('Courses\n\nFruits & légumes\n☐ 1 kg Tomates');
  });
});

describe('pictures of a video offered as the photo', () => {
  it('best first, never twice the same moment', () => {
    const f = (time: number, score: number) => ({ uri: `${time}.jpg`, time, score });
    const frames = [f(0, 10), f(1, 90), f(2, 85), f(5, 50), f(6, 70), f(12, 5)];
    expect(pickFrames(frames, 3)).toEqual(['1.jpg', '6.jpg', '12.jpg']);
    expect(pickFrames([], 6)).toEqual([]);
  });
});
