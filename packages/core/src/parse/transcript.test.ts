import { describe, expect, it } from 'vitest';
import { recipeFromTranscript, vttToLines } from './transcript';
import { importFromUrl, type FetchPage } from './url';

/** Automatic subtitles in the style TikTok publishes (ASR, punctuated). */
const SPOKEN_VTT = `WEBVTT


00:00:00.200 --> 00:00:02.760
Vous connaissez les pâtes aux oignons ?

00:00:02.761 --> 00:00:04.721
Oh là là mais c'est trop bon !

00:00:09.360 --> 00:00:10.840
Dans une poêle avec du beurre,

00:00:10.841 --> 00:00:12.121
je fais caraméliser les oignons

00:00:12.200 --> 00:00:13.160
et je déglace au vin blanc.

00:00:13.200 --> 00:00:14.560
Ensuite j'ajoute du bouillon.

00:00:18.360 --> 00:00:20.200
J'ajoute 20 cl de crème fraîche,

00:00:20.480 --> 00:00:21.280
les pâtes,

00:00:21.320 --> 00:00:23.920
je mélange et je termine avec du fromage râpé.

00:00:28.880 --> 00:00:31.400
Allez, bisous !
`;

describe('recipe explained out loud (automatic subtitles)', () => {
  it('reads WebVTT, including rolling auto-caption duplicates and tags', () => {
    expect(vttToLines(SPOKEN_VTT)[0]).toBe('Vous connaissez les pâtes aux oignons ?');
    const rolling = `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nmettez 200\n\n00:00:01.000 --> 00:00:02.000\nmettez 200 <00:00:01.500><c>grammes de farine</c>\n\n00:00:02.000 --> 00:00:03.000\ngrammes de farine\n`;
    expect(vttToLines(rolling)).toEqual(['mettez 200 grammes de farine']);
  });

  it('finds the foods mentioned, quantities when said, and the cooking actions', () => {
    const r = recipeFromTranscript(vttToLines(SPOKEN_VTT));
    expect(r.ingredients.map((i) => [i.quantity, i.unit, i.name])).toEqual([
      [null, null, 'pâtes'],
      [null, null, 'oignons'],
      [null, null, 'beurre'],
      [null, null, 'vin blanc'],
      [null, null, 'bouillon'],
      [20, 'cl', 'crème fraîche'],
      [null, null, 'fromage'],
    ]);
    expect(r.steps.map((s) => s.text)).toEqual([
      'Dans une poêle avec du beurre, je fais caraméliser les oignons et je déglace au vin blanc.',
      "Ensuite j'ajoute du bouillon.",
      "J'ajoute 20 cl de crème fraîche, les pâtes, je mélange et je termine avec du fromage râpé.",
    ]);
    expect(r.text).toContain('Allez, bisous !');
  });

  it('handles spoken numbers, measures and captions without punctuation', () => {
    const r = recipeFromTranscript([
      'alors on commence avec 200 grammes de farine',
      'puis deux cuillères à soupe de sucre et trois oeufs',
      'on ajoute 50 cl de lait petit à petit',
      'on mélange bien',
      'et on laisse reposer 30 minutes',
      'voilà abonnez-vous',
    ]);
    expect(r.ingredients.map((i) => [i.quantity, i.unit, i.name])).toEqual([
      [200, 'g', 'farine'],
      [2, 'tbsp', 'sucre'],
      [3, null, 'oeufs'],
      [50, 'cl', 'lait'],
    ]);
    expect(r.steps.map((s) => [s.text, s.timerSeconds])).toEqual([
      ['On ajoute 50 cl de lait petit à petit', null],
      ['On mélange bien', null],
      ['Et on laisse reposer 30 minutes', 1800],
    ]);
  });

  it('a quantity only belongs to the food right after it', () => {
    const r = recipeFromTranscript(['Dans 1 poêle avec du beurre, mais pas trop.']);
    expect(r.ingredients).toEqual([expect.objectContaining({ name: 'beurre', quantity: null })]);
  });

  it('TikTok without the recipe in the caption: completed from the subtitles', async () => {
    const url = 'https://www.tiktok.com/@chef/video/1';
    const subs = 'https://v16m-webapp.tiktokcdn.com/subs.vtt';
    const page = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(
      {
        __DEFAULT_SCOPE__: {
          'webapp.video-detail': {
            itemInfo: {
              itemStruct: {
                desc: 'Pâtes aux oignons 🧅 #pasta',
                contents: [{ desc: 'Pâtes aux oignons 🧅 #pasta' }],
                author: { nickname: 'Chef' },
                video: {
                  subtitleInfos: [
                    { Url: 'https://x.tiktokcdn.com/en.vtt', Format: 'webvtt', Source: 'MT' },
                    { Url: subs, Format: 'webvtt', Source: 'ASR', LanguageCodeName: 'fra-FR' },
                  ],
                },
              },
            },
          },
        },
      },
    )}</script>`;
    const fetchPage: FetchPage = async (u) =>
      u === url
        ? { status: 200, contentType: 'text/html', body: page }
        : u === subs
          ? { status: 200, contentType: 'video/mp4', body: SPOKEN_VTT }
          : { status: 404, contentType: 'text/html', body: '' };
    const r = await importFromUrl(fetchPage, url);
    expect(r.fromSpeech).toBe(true);
    expect(r.draft.title).toBe('Pâtes aux oignons');
    expect(r.draft.ingredients).toHaveLength(7);
    expect(r.draft.steps).toHaveLength(3);
    expect(r.draft.notes).toContain('🎙️ Vous connaissez les pâtes aux oignons ?');
  });
});
