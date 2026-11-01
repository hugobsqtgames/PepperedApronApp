/**
 * TestFlight feedback: imports from TikTok, Instagram or Pinterest stayed "waiting" for minutes.
 * A site that refused the connection or was slow was taken for the phone being offline (queue
 * paused, up to 9 tries). Offline now means Apple's connectivity check fails too.
 */
jest.mock('../src/services/runtime', () => ({ runtime: { session: null } }));
import { importLinkFull } from '../src/services/importer';

const URL_ = 'https://www.pinterest.com/pin/123456789/';
const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

const answer = (siteError: Error | null, internet: boolean) =>
  jest.fn(async (url: string) => {
    if (String(url).includes('captive.apple.com')) {
      if (!internet) throw new TypeError('Network request failed');
      return { status: 200, ok: true, text: async () => 'Success', headers: { get: () => null } };
    }
    if (siteError) throw siteError;
    return { status: 404, ok: false, text: async () => '', headers: { get: () => 'text/html' } };
  }) as unknown as typeof fetch;

it('a site refusing the connection while the internet works: not offline (saved now)', async () => {
  global.fetch = answer(new TypeError('Network request failed'), true);
  const r = await importLinkFull(URL_, () => undefined, [0, 0]);
  expect(r.offline).toBe(false);
  expect(r.result.draft.sourceUrl).toBe(URL_);
});

it('no internet at all: offline (tried again when the network is back)', async () => {
  global.fetch = answer(new TypeError('Network request failed'), false);
  const r = await importLinkFull(URL_, () => undefined, [0, 0]);
  expect(r.offline).toBe(true);
});

it('a site too slow to answer is not the phone being offline', async () => {
  const abort = new Error('Aborted');
  abort.name = 'AbortError';
  const f = answer(abort, false);
  global.fetch = f;
  const r = await importLinkFull(URL_, () => undefined, [0, 0]);
  expect(r.offline).toBe(false);
});

/**
 * TestFlight feedback: imported reels came without their steps. The post page failed on the
 * first try (TikTok and Instagram often cut the first connection or answer slowly): the recipe
 * was saved from the little left (the oEmbed caption), without the subtitles or the video where
 * the steps are said. The page is now read again before saving.
 */
describe('a post page that fails on the first try is read again', () => {
  const TIKTOK = 'https://www.tiktok.com/@chef/video/7300000000000000001';
  const VTT = `WEBVTT

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

00:00:21.320 --> 00:00:23.920
je mélange et je termine avec du fromage râpé.
`;
  const page = `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(
    {
      __DEFAULT_SCOPE__: {
        'webapp.video-detail': {
          itemInfo: {
            itemStruct: {
              desc: 'Les pâtes aux oignons 🧅 #recette',
              author: { nickname: 'Chef' },
              video: {
                cover: 'https://p16.example/cover.jpg',
                subtitleInfos: [
                  { Url: 'https://v16.example/sub.vtt', Format: 'webvtt', Source: 'ASR' },
                ],
              },
            },
          },
        },
      },
    },
  )}</script></html>`;
  const ok = (body: string, type: string) => ({
    status: 200,
    ok: true,
    text: async () => body,
    headers: { get: () => type },
  });

  it('TikTok: the steps said in the video are there', async () => {
    let pageCalls = 0;
    global.fetch = jest.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('captive.apple.com')) return ok('Success', 'text/html');
      if (u.includes('/oembed'))
        return ok(
          JSON.stringify({ title: 'Les pâtes aux oignons 🧅', author_name: 'Chef' }),
          'application/json',
        );
      if (u.endsWith('.vtt')) return ok(VTT, 'text/vtt');
      pageCalls++;
      // First reading of the page: the connection is cut.
      if (pageCalls === 1) throw new TypeError('Network request failed');
      return ok(page, 'text/html');
    }) as unknown as typeof fetch;
    const r = await importLinkFull(TIKTOK, () => undefined, [0, 0]);
    expect(pageCalls).toBe(2);
    expect(r.offline).toBe(false);
    expect(r.result.draft.steps.length).toBeGreaterThan(0);
  });

  it('a page too slow the first time is read again too', async () => {
    let pageCalls = 0;
    global.fetch = jest.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('captive.apple.com')) return ok('Success', 'text/html');
      if (u.includes('/oembed')) return ok('{}', 'application/json');
      if (u.endsWith('.vtt')) return ok(VTT, 'text/vtt');
      pageCalls++;
      if (pageCalls === 1) {
        const e = new Error('Aborted');
        e.name = 'AbortError';
        throw e;
      }
      return ok(page, 'text/html');
    }) as unknown as typeof fetch;
    const r = await importLinkFull(TIKTOK, () => undefined, [0, 0]);
    expect(r.result.draft.steps.length).toBeGreaterThan(0);
  });

  it('read well the first time: read once', async () => {
    let pageCalls = 0;
    global.fetch = jest.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/oembed')) return ok('{}', 'application/json');
      if (u.endsWith('.vtt')) return ok(VTT, 'text/vtt');
      pageCalls++;
      return ok(page, 'text/html');
    }) as unknown as typeof fetch;
    await importLinkFull(TIKTOK, () => undefined, [0, 0]);
    expect(pageCalls).toBe(1);
  });
});
