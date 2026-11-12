/**
 * TestFlight feedback: "la lecture des vidéos marche pas très bien". The post, the text written
 * on the video and what is said are now put together, and Apple's on-device model (when the
 * iPhone has it) proposes a version that is checked against the three before being used.
 */
jest.mock('../src/services/runtime', () => ({ runtime: { session: null } }));
jest.mock('../src/services/videoFrames', () => ({}));

const model = {
  availability: 'available',
  answer: null as unknown,
  fail: null as Error | null,
  prompts: [] as string[],
};
jest.mock('../modules/recipe-model', () => ({
  recipeModelAvailability: async () => model.availability,
  structureRecipe: async (_instructions: string, prompt: string) => {
    model.prompts.push(prompt);
    if (model.fail) throw model.fail;
    return model.answer;
  },
}));

/** Pictures of a reel: an account name at the bottom, two quantities written for a while. */
jest.mock('../modules/video-speech', () => ({
  videoSpeechAvailable: true,
  transcribeVideo: async () => [],
  videoFrames: async () =>
    Array.from({ length: 10 }, (_, i) => ({ uri: `file:///f${i}.jpg`, time: i * 2 + 1, score: i })),
}));
jest.mock('../modules/text-vision', () => ({
  textVisionAvailable: true,
  recognizeText: async (uri: string) => {
    const i = Number(/f(\d+)/.exec(uri)![1]);
    const line = (text: string, y: number) => ({
      text,
      confidence: 0.9,
      x: 0.1,
      y,
      width: 0.5,
      height: 0.04,
    });
    return [
      line('@chef_lea', 0.92),
      ...(i < 5 ? [line('200 g de spaghetti', 0.3), line('100 g de pancetta', 0.4)] : []),
    ];
  },
}));
jest.mock('expo-file-system', () => ({
  Directory: class {},
  Paths: { cache: '' },
  File: class {
    delete() {}
  },
}));

import { emptyDraft, type SpeechSegment } from '@pepperedapron/core';
import { fuseVideo, readVideoPictures } from '../src/services/importer';

const said: SpeechSegment[] = [
  'Salut à tous, aujourd’hui des spaghetti carbonara.',
  'Faites cuire les spaghetti dans l’eau bouillante salée.',
  'Faites dorer la pancetta dans une poêle sans matière grasse.',
  'Mélangez deux jaunes d’œufs avec le pecorino.',
  'Mélangez les spaghetti avec la pancetta et les œufs hors du feu.',
].map((text, i) => ({ text, start: i * 5, end: i * 5 + 4 }));

const caption = { ...emptyDraft(), title: 'Tu vas adorer 😍', description: '#pasta #recette' };

beforeEach(() => {
  model.availability = 'available';
  model.answer = null;
  model.fail = null;
  model.prompts = [];
});

it('reads the text of the pictures with its place, sets the account name aside', async () => {
  const pictures = await readVideoPictures('file:///reel.mp4');
  expect(pictures.screen).toHaveLength(10);
  expect(pictures.screen![0]!.lines[1]).toMatchObject({ text: '200 g de spaghetti', y: 0.3 });
  const { draft } = await fuseVideo(caption, pictures, said);
  expect(draft.ingredients.map((i) => [i.quantity, i.name])).toEqual(
    expect.arrayContaining([
      [200, 'spaghetti'],
      [100, 'pancetta'],
    ]),
  );
  expect(JSON.stringify(draft)).not.toContain('chef_lea');
  expect(draft.steps.length).toBeGreaterThanOrEqual(3);
});

it('the model is told the three sources; what it invents is dropped', async () => {
  const pictures = await readVideoPictures('file:///reel.mp4');
  model.answer = {
    title: 'Spaghetti carbonara',
    ingredients: [
      { name: 'spaghetti', quantity: '200', unit: 'g' },
      { name: 'pancetta', quantity: '100', unit: 'g' },
      { name: 'jaunes d’œufs', quantity: '2' },
      { name: 'pecorino' },
      { name: 'crème fraîche', quantity: '20', unit: 'cl' },
    ],
    steps: [
      'Faire cuire les spaghetti dans l’eau bouillante salée.',
      'Faire dorer la pancetta dans une poêle sans matière grasse.',
      'Mélanger les jaunes d’œufs avec le pecorino.',
      'Hors du feu, mélanger les spaghetti, la pancetta et les œufs.',
      'Ajouter la crème fraîche et du persil.',
    ],
  };
  const { draft, trace } = await fuseVideo(caption, pictures, said);
  expect(model.prompts[0]).toContain('200 g de spaghetti');
  expect(model.prompts[0]).toContain('pancetta dans une poêle');
  expect(model.prompts[0]).not.toContain('chef_lea');
  // No cream in a carbonara video that never shows nor says it.
  expect(JSON.stringify(draft)).not.toMatch(/crème fraîche|persil/);
  expect(draft.title).toBe('Spaghetti carbonara');
  expect(draft.ingredients.find((i) => /jaune/.test(i.name))?.quantity).toBe(2);
  expect(trace.join(' ')).toMatch(/model: [1-9] invented/);
  expect(trace[0]).toMatch(/^fusion: /);
});

it('without the model (older iPhone) or when it fails, the fused recipe is used', async () => {
  const pictures = await readVideoPictures('file:///reel.mp4');
  model.availability = 'unavailable:deviceNotEligible';
  const a = await fuseVideo(caption, pictures, said);
  expect(model.prompts).toHaveLength(0);
  expect(a.trace.join(' ')).toContain('model: unavailable:deviceNotEligible');
  model.availability = 'available';
  model.fail = new Error('exceededContextWindowSize');
  const b = await fuseVideo(caption, pictures, said);
  expect(b.trace.join(' ')).toContain('model: exceededContextWindowSize');
  expect(b.draft.steps.map((s) => s.text)).toEqual(a.draft.steps.map((s) => s.text));
  expect(b.draft.ingredients.length).toBeGreaterThanOrEqual(2);
});
