import { describe, expect, it } from 'vitest';
import { importFromUrl, ImportUrlError, normalizeImportUrl, type FetchPage } from './url';

function fake(pages: Record<string, { status?: number; contentType?: string; body: string }>) {
  const calls: string[] = [];
  const fetchPage: FetchPage = async (url) => {
    calls.push(url);
    const p = pages[url];
    if (!p) return { status: 404, contentType: 'text/html', body: '' };
    return { status: p.status ?? 200, contentType: p.contentType ?? 'text/html', body: p.body };
  };
  return { fetchPage, calls };
}

describe('import from URL (on device, no AI)', () => {
  it('extracts schema.org recipes from web pages', async () => {
    const { fetchPage } = fake({
      'https://blog.test/tarte': {
        contentType: 'text/html; charset=utf-8',
        body: `<html><script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Tarte tatin', recipeYield: '6', recipeIngredient: ['6 pommes', '150 g de sucre'], recipeInstructions: [{ '@type': 'HowToStep', text: 'Caraméliser.' }] })}</script></html>`,
      },
    });
    const r = await importFromUrl(fetchPage, 'https://blog.test/tarte');
    expect(r).toMatchObject({
      completeness: 'full',
      platform: 'web',
      draft: { title: 'Tarte tatin', servings: 6, sourceUrl: 'https://blog.test/tarte' },
    });
  });

  it('falls back to OpenGraph meta', async () => {
    const { fetchPage } = fake({
      'https://site.test/x': {
        body: '<meta property="og:title" content="Gratin"><meta property="og:site_name" content="Site">',
      },
    });
    const r = await importFromUrl(fetchPage, 'https://site.test/x');
    expect(r).toMatchObject({
      completeness: 'partial',
      draft: { title: 'Gratin', source: 'Site' },
    });
  });

  it('uses the public TikTok oEmbed caption and never promises more', async () => {
    const url = 'https://www.tiktok.com/@chef/video/123';
    const { fetchPage } = fake({
      [`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`]: {
        contentType: 'application/json',
        body: JSON.stringify({
          title: 'Pâtes au citron 🍋\n200 g de pâtes\n1 citron\n#pasta',
          author_name: 'chef',
          thumbnail_url: 'https://p16.tiktokcdn.com/x.jpg',
        }),
      },
    });
    const r = await importFromUrl(fetchPage, url);
    expect(r).toMatchObject({
      platform: 'tiktok',
      completeness: 'partial',
      draft: { author: 'chef', imageUrl: 'https://p16.tiktokcdn.com/x.jpg', tags: ['pasta'] },
    });
    expect(r.draft.ingredients).toHaveLength(2);
    const ig = await importFromUrl(fetchPage, 'https://www.instagram.com/p/abc/');
    expect(ig).toMatchObject({
      platform: 'instagram',
      completeness: 'minimal',
      draft: { sourceUrl: 'https://www.instagram.com/p/abc/' },
    });
  });

  it('keeps the link when the network fails or the answer is garbage', async () => {
    const offline: FetchPage = async () => {
      throw new Error('offline');
    };
    expect(await importFromUrl(offline, 'https://blog.test/a')).toMatchObject({
      completeness: 'minimal',
      draft: { sourceUrl: 'https://blog.test/a', source: 'blog.test' },
    });
    const { fetchPage } = fake({
      'https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fyoutu.be%2Fx': {
        body: 'not json',
      },
      'https://pdf.test/a': { contentType: 'application/pdf', body: '%PDF' },
    });
    expect((await importFromUrl(fetchPage, 'https://youtu.be/x')).completeness).toBe('minimal');
    expect((await importFromUrl(fetchPage, 'https://pdf.test/a')).completeness).toBe('minimal');
  });

  it('extracts the link from shared text and refuses non-http URLs', () => {
    expect(normalizeImportUrl('Regarde ça https://vm.tiktok.com/ZM123/ 😋').toString()).toBe(
      'https://vm.tiktok.com/ZM123/',
    );
    for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'pas un lien', ''])
      expect(() => normalizeImportUrl(bad)).toThrow(ImportUrlError);
  });
});
