/*
 * Regression: on the phone, URL is React Native's partial implementation, not Node's (used by
 * every other test). The app installs a standard one (src/polyfills.ts); with it, the link code
 * gives exactly the results checked in the core tests.
 */
import { URL as StandardURL } from 'react-native-url-polyfill';
import { canonicalUrl, detectPlatform, normalizeImportUrl } from '@pepperedapron/core';

const LINKS = [
  'https://www.marmiton.org/recettes/recette_tarte-aux-pommes_12345.aspx',
  'HTTPS://WWW.Instagram.COM/p/C1a2B3c4D5e/?igsh=abc',
  'https://youtu.be/dQw4w9WgXcQ?si=xyz',
  'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
  'https://www.tiktok.com/@chef/video/7300000000000000000',
  'https://pin.it/3xYz',
  'http://example.com',
  'https://exemple.fr/recette#etape-2',
  'https://exemple.fr/a b/crème brûlée',
  'Regarde ça https://www.cuisineaz.com/recettes/gratin-123.aspx !',
  'not a link',
  'ftp://files.example.com/recette.pdf',
  'javascript:alert(1)',
  'https://',
  '',
];

type URLCtor = typeof globalThis.URL;
function results(Impl: URLCtor) {
  const saved = globalThis.URL;
  globalThis.URL = Impl;
  try {
    return LINKS.map((l) => {
      const out: Record<string, unknown> = { canonical: canonicalUrl(l) };
      try {
        const u = normalizeImportUrl(l);
        out.url = u.toString();
        out.platform = detectPlatform(u);
      } catch (e) {
        out.error = (e as Error).message;
      }
      return out;
    });
  } finally {
    globalThis.URL = saved;
  }
}

describe('URL on the phone', () => {
  it('with the polyfill, link handling matches the tested (standard) behaviour', () => {
    expect(results(StandardURL as unknown as URLCtor)).toEqual(results(globalThis.URL));
  });

  it("React Native's own URL would not (why the polyfill is installed)", () => {
    const { URL: RNURL } = jest.requireActual<{ URL: URLCtor }>('react-native/Libraries/Blob/URL');
    expect(results(RNURL)).not.toEqual(results(globalThis.URL));
  });
});
