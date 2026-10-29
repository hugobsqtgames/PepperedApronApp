import { describe, expect, it } from 'vitest';
import { extractUrls, instagramSavedPosts } from './links';

describe('links in a text', () => {
  it('finds each publication once, without trailing punctuation', () => {
    expect(
      extractUrls(
        'Regarde ça https://www.instagram.com/reel/AAA/?igsh=1. Et https://instagram.com/p/AAA, puis (https://www.tiktok.com/@a/video/123) !',
      ),
    ).toEqual([
      'https://www.instagram.com/reel/AAA/?igsh=1',
      'https://www.tiktok.com/@a/video/123',
    ]);
    expect(extractUrls('pas de lien')).toEqual([]);
  });
});

describe('Instagram export', () => {
  it('reads saved posts and their collections', () => {
    const posts = JSON.stringify({
      saved_saved_media: [
        {
          title: 'chef.lea',
          string_map_data: {
            'Saved on': { href: 'https://www.instagram.com/p/AAA/', timestamp: 1 },
          },
        },
        {
          title: 'marco',
          string_map_data: {
            'Saved on': { href: 'https://www.instagram.com/reel/BBB/', timestamp: 2 },
          },
        },
      ],
    });
    const collections = JSON.stringify({
      saved_saved_collections: [
        {
          title: 'Collection',
          string_map_data: { Name: { value: 'Desserts' }, 'Creation Time': { timestamp: 1 } },
        },
        {
          title: 'Saved',
          string_map_data: { Name: { href: 'https://www.instagram.com/p/BBB/', value: 'marco' } },
        },
        { title: 'Collection', string_map_data: { Name: { value: 'Apéro' } } },
        {
          title: 'Saved',
          string_map_data: { Name: { href: 'https://www.instagram.com/reel/CCC/', value: 'x' } },
        },
      ],
    });
    expect(
      instagramSavedPosts([
        { name: 'your_instagram_activity/saved/saved_posts.json', text: posts },
        { name: 'your_instagram_activity/saved/saved_collections.json', text: collections },
      ]),
    ).toEqual([
      { url: 'https://www.instagram.com/p/BBB/', collection: 'Desserts' },
      { url: 'https://www.instagram.com/p/CCC/', collection: 'Apéro' },
      { url: 'https://www.instagram.com/p/AAA/', collection: null },
    ]);
  });
  it('also reads the HTML version', () => {
    expect(
      instagramSavedPosts([
        { name: 'saved_posts.html', text: '<a href="https://www.instagram.com/p/XYZ/">x</a>' },
      ]),
    ).toEqual([{ url: 'https://www.instagram.com/p/XYZ/', collection: null }]);
  });
});
