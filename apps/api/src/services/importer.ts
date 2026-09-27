import { emptyDraft, parseHtmlMeta, parseJsonLdRecipe, parseRecipeText, type RecipeDraft } from '@pepperedapron/core';
import type { SafeFetch } from '../lib/safeFetch';
import { SafeFetchError } from '../lib/safeFetch';

export type ImportPlatform = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'pinterest' | 'web';

export interface ImportResult {
  draft: RecipeDraft;
  platform: ImportPlatform;
  /** full: structured recipe found; partial: caption/description parsed; minimal: link only. */
  completeness: 'full' | 'partial' | 'minimal';
}

export function detectPlatform(url: URL): ImportPlatform {
  const h = url.hostname.replace(/^www\.|^m\.|^vm\.|^vt\./, '');
  if (h.endsWith('tiktok.com')) return 'tiktok';
  if (h.endsWith('instagram.com')) return 'instagram';
  if (h.endsWith('youtube.com') || h === 'youtu.be') return 'youtube';
  if (h.endsWith('facebook.com') || h === 'fb.watch') return 'facebook';
  if (h.endsWith('pinterest.com') || h.endsWith('pinterest.fr') || h === 'pin.it') return 'pinterest';
  return 'web';
}

function mergeCaption(draft: RecipeDraft, caption: string | null) {
  if (!caption) return;
  const parsed = parseRecipeText(caption);
  draft.ingredients = parsed.ingredients;
  draft.steps = parsed.steps;
  draft.tags = parsed.tags;
  draft.servings ??= parsed.servings;
  draft.prepMinutes ??= parsed.prepMinutes;
  draft.cookMinutes ??= parsed.cookMinutes;
  draft.totalMinutes ??= parsed.totalMinutes;
  draft.ovenTemperatureC ??= parsed.ovenTemperatureC;
  // Keep the whole caption available in the editor: nothing is lost.
  draft.notes = caption.slice(0, 5000);
  if (!draft.title && parsed.title) draft.title = parsed.title.slice(0, 200);
}

/**
 * Import only what is technically and legally reachable: oEmbed for TikTok/YouTube, public
 * schema.org data or OpenGraph meta otherwise. Never scrapes behind logins.
 */
export async function importFromUrl(fetchUrl: SafeFetch, raw: string): Promise<ImportResult> {
  const url = new URL(raw);
  const platform = detectPlatform(url);
  const draft = emptyDraft();
  draft.sourceUrl = url.toString();
  draft.source = platform === 'web' ? url.hostname.replace(/^www\./, '') : platform[0]!.toUpperCase() + platform.slice(1);

  const oembed = platform === 'tiktok' ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url.toString())}` : platform === 'youtube' ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.toString())}` : null;
  if (oembed) {
    try {
      const r = await fetchUrl(oembed, { accept: 'application/json', maxBytes: 512 * 1024 });
      if (r.status === 200) {
        const j = JSON.parse(r.body) as { title?: string; author_name?: string; thumbnail_url?: string };
        draft.author = j.author_name ?? null;
        draft.imageUrl = j.thumbnail_url && /^https:\/\//.test(j.thumbnail_url) ? j.thumbnail_url : null;
        mergeCaption(draft, j.title ?? null);
        if (!draft.title && j.title) draft.title = j.title.split('\n')[0]!.slice(0, 120);
        return { draft, platform, completeness: draft.ingredients.length || draft.steps.length ? 'partial' : j.title ? 'partial' : 'minimal' };
      }
    } catch (e) {
      if (e instanceof SafeFetchError && e.code === 'blocked_address') throw e;
    }
    return { draft, platform, completeness: 'minimal' };
  }

  let page;
  try {
    page = await fetchUrl(url.toString());
  } catch (e) {
    if (e instanceof SafeFetchError && (e.code === 'blocked_address' || e.code === 'invalid_url')) throw e;
    return { draft, platform, completeness: 'minimal' };
  }
  if (page.status >= 400 || !(page.contentType ?? '').includes('html')) return { draft, platform, completeness: 'minimal' };

  const structured = parseJsonLdRecipe(page.body);
  if (structured) {
    structured.sourceUrl = draft.sourceUrl;
    structured.source = draft.source;
    return { draft: structured, platform, completeness: structured.ingredients.length && structured.steps.length ? 'full' : 'partial' };
  }
  const meta = parseHtmlMeta(page.body);
  draft.title = meta.title?.slice(0, 200) ?? null;
  draft.imageUrl = meta.image;
  draft.author = meta.author;
  if (meta.siteName && platform === 'web') draft.source = meta.siteName.slice(0, 100);
  if (meta.description) {
    if (platform === 'instagram' || platform === 'facebook' || platform === 'pinterest') mergeCaption(draft, meta.description);
    else draft.description = meta.description.slice(0, 2000);
  }
  return { draft, platform, completeness: draft.ingredients.length ? 'partial' : draft.title ? 'partial' : 'minimal' };
}
