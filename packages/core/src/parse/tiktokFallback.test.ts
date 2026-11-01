import { describe, expect, it } from 'vitest';
import { importFromUrl, type FetchPage } from './url';

/**
 * TestFlight feedback: TikTok recipes said out loud came without steps. When the video page
 * has no subtitles, TikTok's mobile page of the same video is read; a machine translation is
 * only used when nothing else exists.
 */
const VTT = `WEBVTT

00:00:05.080 --> 00:00:06.520
tu vas prendre 3 poivrons rouges que tu vas couper grossièrement.

00:00:07.321 --> 00:00:08.961
Tu mets tout ça sur 1 plaque qui va au four.

00:00:10.480 --> 00:00:12.360
Ensuite tu fais cuire les pâtes dans l'eau bouillante salée.

00:00:13.041 --> 00:00:14.761
Tu mixes les légumes avec 20 cl de crème liquide.

00:00:15.401 --> 00:00:16.921
Enfin tu mélanges la sauce et les pâtes avec du parmesan.
`;

const page = (subs: { Url: string; Source: string; LanguageCodeName: string }[]) =>
  `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({
    __DEFAULT_SCOPE__: {
      'webapp.video-detail': {
        itemInfo: {
          itemStruct: {
            desc: 'Cette recette de pâtes est hyper addictive ! #pates',
            author: { nickname: 'Chef' },
            video: { subtitleInfos: subs.map((s) => ({ ...s, Format: 'webvtt' })) },
          },
        },
      },
    },
  })}</script></html>`;

const URL_ = 'https://www.tiktok.com/@chef/video/7427190555605716257';

function fetcher(pages: Record<string, string>): { fetchPage: FetchPage; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetchPage: async (url) => {
      calls.push(url);
      const hit = Object.entries(pages).find(([k]) => url.startsWith(k));
      if (!hit) return { status: 404, contentType: 'text/html', body: '' };
      return { status: 200, contentType: 'text/html', body: hit[1] };
    },
  };
}

describe('TikTok: what is said in the video', () => {
  it('the video page without subtitles: the mobile page gives them', async () => {
    const { fetchPage, calls } = fetcher({
      [URL_]: page([]),
      'https://m.tiktok.com/v/7427190555605716257.html': page([
        { Url: 'https://cdn.example/fr.vtt', Source: 'ASR', LanguageCodeName: 'fra-FR' },
      ]),
      'https://cdn.example/fr.vtt': VTT,
    });
    const r = await importFromUrl(fetchPage, URL_);
    expect(calls).toContain('https://m.tiktok.com/v/7427190555605716257.html');
    expect(r.draft.steps.length).toBeGreaterThanOrEqual(3);
    expect(r.fromSpeech).toBe(true);
  });

  it('the French recognition is chosen over an English machine translation', async () => {
    const { fetchPage } = fetcher({
      [URL_]: page([
        { Url: 'https://cdn.example/en.vtt', Source: 'MT', LanguageCodeName: 'eng-US' },
        { Url: 'https://cdn.example/fr.vtt', Source: 'ASR', LanguageCodeName: 'fra-FR' },
      ]),
      'https://cdn.example/fr.vtt': VTT,
      'https://cdn.example/en.vtt':
        'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nYou take three peppers.\n',
    });
    const r = await importFromUrl(fetchPage, URL_);
    expect(r.draft.steps.map((s) => s.text).join(' ')).toContain('poivrons');
  });

  it('subtitles on the video page: the mobile page is not read', async () => {
    const { fetchPage, calls } = fetcher({
      [URL_]: page([
        { Url: 'https://cdn.example/fr.vtt', Source: 'ASR', LanguageCodeName: 'fra-FR' },
      ]),
      'https://cdn.example/fr.vtt': VTT,
    });
    await importFromUrl(fetchPage, URL_);
    expect(calls.some((c) => c.includes('m.tiktok.com'))).toBe(false);
  });
});
