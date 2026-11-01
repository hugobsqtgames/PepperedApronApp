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
  const r = await importLinkFull(URL_, () => undefined);
  expect(r.offline).toBe(false);
  expect(r.result.draft.sourceUrl).toBe(URL_);
});

it('no internet at all: offline (tried again when the network is back)', async () => {
  global.fetch = answer(new TypeError('Network request failed'), false);
  const r = await importLinkFull(URL_, () => undefined);
  expect(r.offline).toBe(true);
});

it('a site too slow to answer is not the phone being offline', async () => {
  const abort = new Error('Aborted');
  abort.name = 'AbortError';
  const f = answer(abort, false);
  global.fetch = f;
  const r = await importLinkFull(URL_, () => undefined);
  expect(r.offline).toBe(false);
});
