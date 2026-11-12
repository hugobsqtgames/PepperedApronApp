/**
 * TestFlight feedback: a photo of a 6-step recipe in a book gave 28 steps (one per printed line,
 * cut mid-sentence). The page is now read in paragraphs, from where each line sits.
 */
jest.mock('../src/services/runtime', () => ({ runtime: { session: null } }));
jest.mock('../src/services/importer', () => ({}));
jest.mock('../src/services/photos', () => ({}));
jest.mock('../src/services/videoFrames', () => ({}));
jest.mock('../modules/pdf-text', () => ({}));

const LINES: { text: string; width: number; gapBefore?: boolean }[] = [
  { text: 'Pâtes aux broccolinis', width: 0.5 },
  { text: 'Pour 4 personnes', width: 0.3, gapBefore: true },
  { text: '400 g de pâtes', width: 0.3 },
  { text: '300 g de broccolinis', width: 0.38 },
  { text: '50 g de parmesan', width: 0.33 },
  {
    text: 'Portez une grande casserole d’eau salée à ébullition. Pendant ce temps,',
    width: 0.84,
    gapBefore: true,
  },
  { text: 'lavez les broccolinis et coupez les tiges épaisses en deux.', width: 0.6 },
  {
    text: 'Plongez les pâtes dans l’eau bouillante. Réunissez les Avengers. J’adore',
    width: 0.84,
    gapBefore: true,
  },
  { text: 'les petites blagues au milieu d’une recette. Prélevez un peu d’eau de', width: 0.84 },
  { text: 'cuisson des pâtes, puis égouttez les broccolinis et les pâtes.', width: 0.6 },
  {
    text: 'Versez le tout dans la poêle avec le parmesan, mélangez bien et servez',
    width: 0.84,
    gapBefore: true,
  },
  { text: 'aussitôt.', width: 0.15 },
];

jest.mock('../modules/text-vision', () => {
  let y = 0.05;
  const placed = LINES.map((l) => {
    if (l.gapBefore) y += 0.03;
    const line = { text: l.text, confidence: 1, x: 0.08, y, width: l.width, height: 0.025 };
    y += 0.035;
    return line;
  });
  return {
    textVisionAvailable: true,
    recognizeText: async () => placed,
  };
});

import { prepareImport } from '../src/services/autoImport';

it('a book page without headings: one action per step, never one per printed line', async () => {
  const p = await prepareImport({ kind: 'photos', uris: ['file:///book.jpg'] });
  expect(p.draft.steps.map((s) => s.text)).toEqual([
    'Portez une grande casserole d’eau salée à ébullition.',
    'Pendant ce temps, lavez les broccolinis.',
    'Coupez les tiges épaisses en deux.',
    'Plongez les pâtes dans l’eau bouillante.',
    'Réunissez les Avengers. J’adore les petites blagues au milieu d’une recette.',
    'Prélevez un peu d’eau de cuisson des pâtes.',
    'Égouttez les broccolinis et les pâtes.',
    'Versez le tout dans la poêle avec le parmesan.',
    'Mélangez bien.',
    'Servez aussitôt.',
  ]);
  expect(p.draft.ingredients).toHaveLength(3);
});
