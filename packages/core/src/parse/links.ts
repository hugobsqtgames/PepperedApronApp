import { canonicalUrl } from '../duplicates';

const URL_RE = /https?:\/\/[^\s<>"'«»“”‘’)\]]+/gi;

/** Every distinct web link in a text (one per publication), in order of appearance. */
export function extractUrls(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?…]+$/, '');
    const key = canonicalUrl(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

export interface SavedPost {
  url: string;
  /** Name of the Instagram collection the post was saved in, if any. */
  collection: string | null;
}

const POST_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/[\w-]+\/?/gi;

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/**
 * Posts listed in Instagram's "Download your information" export (saved_posts.json,
 * saved_collections.json, or their HTML versions). Collection names are kept when the export
 * gives them; the format is read loosely since Instagram changes it from time to time.
 */
export function instagramSavedPosts(files: { name: string; text: string }[]): SavedPost[] {
  const byKey = new Map<string, SavedPost>();
  const add = (url: string, collection: string | null) => {
    const key = canonicalUrl(url);
    if (!key?.startsWith('instagram:')) return;
    const cur = byKey.get(key);
    if (!cur) byKey.set(key, { url: `https://www.instagram.com/p/${key.slice(10)}/`, collection });
    else if (!cur.collection && collection) cur.collection = collection;
  };
  // Collections first, so posts get their collection name whatever the file order.
  const ordered = [...files].sort(
    (a, b) => Number(/collection/i.test(b.name)) - Number(/collection/i.test(a.name)),
  );
  for (const f of ordered) {
    let parsed: Json | undefined;
    if (/\.json$/i.test(f.name)) {
      try {
        parsed = JSON.parse(f.text) as Json;
      } catch {
        parsed = undefined;
      }
    }
    if (parsed !== undefined) {
      let collection: string | null = null;
      const visit = (v: Json) => {
        if (Array.isArray(v)) return v.forEach(visit);
        if (!v || typeof v !== 'object') {
          if (typeof v === 'string') for (const m of v.matchAll(POST_RE)) add(m[0], collection);
          return;
        }
        // A collection header: {"title": "Collection", "string_map_data": {"Name": {"value": "Desserts"}}}
        const name = (v.string_map_data as { Name?: { value?: Json; href?: Json } } | undefined)
          ?.Name;
        if (
          /collection/i.test(String(v.title ?? '')) &&
          typeof name?.value === 'string' &&
          !name.href
        ) {
          collection = name.value.trim().slice(0, 80) || null;
          return;
        }
        Object.values(v).forEach(visit);
      };
      visit(parsed);
    } else {
      for (const m of f.text.matchAll(POST_RE)) add(m[0], null);
    }
  }
  return [...byKey.values()];
}
