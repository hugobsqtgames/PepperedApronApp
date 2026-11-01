/**
 * TestFlight feedback: reels whose steps are said out loud came without steps. The listening
 * language was guessed from the caption: a French reel captioned in English or with hashtags
 * only ("#pasta #recipe") was listened to in English, and nothing usable came out. The app's
 * language is now tried too, and the best transcript kept.
 */
jest.mock('../src/services/runtime', () => ({ runtime: { session: null } }));
const calls: string[] = [];
jest.mock('../modules/video-speech', () => ({
  videoSpeechAvailable: true,
  transcribeVideo: async (_uri: string, locale: string) => {
    calls.push(locale);
    // French speech heard as English: words, but nothing of a recipe.
    if (locale === 'en-US')
      return [
        'Poor come on say to vapor and three',
        'pole one rouge cap two vacuum gross ear mount.',
      ];
    return [
      'Pour commencer, tu vas prendre 3 poivrons rouges que tu vas couper grossièrement.',
      'Tu mets tout ça sur une plaque qui va au four pendant 30 minutes.',
      'Ensuite tu fais cuire les pâtes dans l’eau bouillante salée.',
      'Enfin tu mixes les légumes avec 20 cl de crème et tu mélanges avec les pâtes.',
    ];
  },
  videoFrames: async () => [],
}));

import i18n from '../src/i18n';
import { transcribeBest } from '../src/services/importer';

beforeEach(() => {
  calls.length = 0;
  void i18n.changeLanguage('fr');
});

it('a French reel guessed English is listened to again in French', async () => {
  const r = await transcribeBest('file:///reel.mp4', 'en');
  expect(calls).toEqual(['en-US', 'fr-FR']);
  expect('error' in r).toBe(false);
  if (!('error' in r)) {
    expect(r.language).toBe('fr');
    expect(r.spoken.steps.length).toBeGreaterThan(0);
  }
});

it('steps heard at the first try: listened to once', async () => {
  const r = await transcribeBest('file:///reel.mp4', 'fr');
  expect(calls).toEqual(['fr-FR']);
  expect(!('error' in r) && r.spoken.steps.length).toBeTruthy();
});
