import { emptyDraft, type RecipeDraft } from './draft';
import { parseHtmlMeta, parseJsonLdRecipe } from './jsonld';
import {
  captionTitle,
  guessLanguage,
  instagramCaption,
  instagramEmbedCaption,
  instagramVideoUrl,
  tiktokCaption,
  unflattenCaption,
  youtubeDescription,
  youtubeSubtitles,
  type Subtitles,
} from './social';
import { recipeFromTranscript, vttToLines } from './transcript';
import { parseRecipeText } from './text';

export type ImportPlatform = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'pinterest' | 'web';

export interface ImportResult {
  draft: RecipeDraft;
  platform: ImportPlatform;
  /** full: structured recipe found; partial: caption/description parsed; minimal: link only. */
  completeness: 'full' | 'partial' | 'minimal';
  /** Part of the recipe comes from what is said in the video (automatic subtitles). */
  fromSpeech?: boolean;
  /**
   * Instagram reel without the recipe in its caption: link of the public video, so the app can
   * listen to it on the device (speech recognition) and complete the recipe.
   */
  videoUrl?: string;
  /** Language of the caption, to listen to the video in the right language. */
  language?: 'fr' | 'en' | 'es' | 'de' | 'it' | null;
}

export interface FetchedPage {
  status: number;
  contentType: string | null;
  body: string;
}

/** Downloads a page as text. Implemented with fetch in the app and faked in tests. */
export type FetchPage = (url: string, opts?: { accept?: string }) => Promise<FetchedPage>;

export class ImportUrlError extends Error {
  constructor(public readonly code: 'invalid_url') {
    super(code);
  }
}

/** Accept only absolute http(s) links (also strips the text around a link pasted from an app). */
export function normalizeImportUrl(raw: string): URL {
  const match = raw.trim().match(/https?:\/\/[^\s<>"']+/i);
  if (!match) throw new ImportUrlError('invalid_url');
  let url: URL;
  try {
    url = new URL(match[0]);
  } catch {
    throw new ImportUrlError('invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new ImportUrlError('invalid_url');
  return url;
}

export function detectPlatform(url: URL): ImportPlatform {
  const h = url.hostname.replace(/^www\.|^m\.|^vm\.|^vt\./, '');
  if (h.endsWith('tiktok.com')) return 'tiktok';
  if (h.endsWith('instagram.com')) return 'instagram';
  if (h.endsWith('youtube.com') || h === 'youtu.be') return 'youtube';
  if (h.endsWith('facebook.com') || h === 'fb.watch') return 'facebook';
  if (h.endsWith('pinterest.com') || h.endsWith('pinterest.fr') || h === 'pin.it')
    return 'pinterest';
  return 'web';
}

function mergeCaption(draft: RecipeDraft, raw: string | null) {
  if (!raw?.trim()) return;
  const caption = unflattenCaption(raw.trim());
  const parsed = parseRecipeText(caption);
  draft.ingredients = parsed.ingredients;
  // "Full recipe on www.…" / "link in bio" lines are not steps (they stay in the notes).
  draft.steps = parsed.steps.filter(
    (st) => !/https?:\/\/|www\.|\blink in bio\b|\blien en bio\b/i.test(st.text),
  );
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
 * Import only what is technically and legally reachable, directly from the device: oEmbed for
 * TikTok/YouTube, public schema.org data or OpenGraph meta otherwise. Never scrapes behind logins
 * and never throws for an unreachable page: the link alone is still a valid draft.
 */
export async function importFromUrl(
  fetchPage: FetchPage,
  raw: string,
  depth = 0,
): Promise<ImportResult> {
  const url = normalizeImportUrl(raw);
  const platform = detectPlatform(url);
  const draft = emptyDraft();
  draft.sourceUrl = url.toString();
  draft.source =
    platform === 'web'
      ? url.hostname.replace(/^www\./, '')
      : platform[0]!.toUpperCase() + platform.slice(1);

  if (platform === 'tiktok' || platform === 'youtube')
    return importVideo(fetchPage, url, platform, draft);
  if (platform === 'instagram') return importInstagram(fetchPage, url, draft);

  let page: FetchedPage;
  try {
    page = await fetchPage(url.toString(), { accept: 'text/html,application/xhtml+xml' });
  } catch {
    return { draft, platform, completeness: 'minimal' };
  }
  if (page.status >= 400 || !(page.contentType ?? '').includes('html'))
    return { draft, platform, completeness: 'minimal' };

  // A pin links to the recipe it was saved from: import the recipe from there.
  if (platform === 'pinterest' && !depth) {
    const origin = pinterestSourceUrl(page.body);
    if (origin) {
      const res = await importFromUrl(fetchPage, origin, 1);
      if (res.completeness !== 'minimal') return res;
    }
  }

  const structured = parseJsonLdRecipe(page.body);
  if (structured) {
    structured.sourceUrl = draft.sourceUrl;
    structured.source = draft.source;
    return {
      draft: structured,
      platform,
      completeness: structured.ingredients.length && structured.steps.length ? 'full' : 'partial',
    };
  }
  const meta = parseHtmlMeta(page.body);
  draft.title = meta.title?.slice(0, 200) ?? null;
  draft.imageUrl = meta.image;
  draft.author = meta.author;
  if (meta.siteName && platform === 'web') draft.source = meta.siteName.slice(0, 100);
  if (meta.description) {
    if (platform === 'facebook' || platform === 'pinterest') mergeCaption(draft, meta.description);
    else draft.description = meta.description.slice(0, 2000);
  }
  return {
    draft,
    platform,
    completeness: draft.ingredients.length || draft.title ? 'partial' : 'minimal',
  };
}

const PINTEREST_HOST = /(^|\.)(pinterest\.[a-z.]+|pin\.it|pinimg\.com)$/i;

/**
 * Link of the page a pin was saved from: in the pin's data ("link":"https:\/\/…") or its
 * og:see_also meta. Pinterest's own links (other pins, images) are ignored.
 */
export function pinterestSourceUrl(html: string): string | null {
  const candidates: string[] = [];
  const see = html.match(
    /<meta[^>]+(?:property|name)=["']og:see_also["'][^>]*content=["']([^"']+)/i,
  );
  if (see) candidates.push(see[1]!);
  const re = /"(?:link|source_url|sourceUrl)"\s*:\s*"(https?:[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && candidates.length < 20) candidates.push(m[1]!);
  for (const c of candidates) {
    const raw = c
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&');
    try {
      const u = new URL(raw);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && !PINTEREST_HOST.test(u.hostname))
        return u.toString();
    } catch {
      // not a link
    }
  }
  return null;
}

/** Post code of an Instagram link (/p/…, /reel/…, /reels/…, /tv/…, with or without a username). */
export function instagramShortcode(url: URL): string | null {
  return url.pathname.match(/\/(?:p|reels?|tv)\/([A-Za-z0-9_-]{5,40})/)?.[1] ?? null;
}

/**
 * Instagram: the caption (where the recipe is written) comes from the public post page, or else
 * from the embed page Instagram provides for websites. Nothing behind a login is read.
 */
async function importInstagram(
  fetchPage: FetchPage,
  url: URL,
  draft: RecipeDraft,
): Promise<ImportResult> {
  const code = instagramShortcode(url);
  let caption: string | null = null;
  let videoUrl: string | null = null;
  const pageHtml = await getText(fetchPage, url.toString(), 'text/html,application/xhtml+xml');
  if (pageHtml) {
    videoUrl = instagramVideoUrl(pageHtml);
    const meta = parseHtmlMeta(pageHtml);
    draft.imageUrl = meta.image;
    // A real caption is quoted after "N likes, N comments - user on date:"; a login page is not.
    if (meta.description && /:\s*["“]/.test(meta.description))
      caption = instagramCaption(meta.description);
  }
  if (!caption && code) {
    const embed = await getText(
      fetchPage,
      `https://www.instagram.com/p/${code}/embed/captioned/`,
      'text/html',
    );
    const fromEmbed = embed ? instagramEmbedCaption(embed) : null;
    videoUrl ??= embed ? instagramVideoUrl(embed) : null;
    if (fromEmbed) {
      caption = fromEmbed.caption;
      draft.author = fromEmbed.author;
      draft.imageUrl ??= fromEmbed.image;
    }
  }
  if (caption) {
    mergeCaption(draft, caption);
    draft.title = captionTitle(caption) ?? draft.title;
  }
  const hasRecipe = draft.ingredients.length > 0 || draft.steps.length > 0;
  return {
    draft,
    platform: 'instagram',
    completeness: hasRecipe || draft.title ? 'partial' : 'minimal',
    // Recipe only said out loud: the app can listen to the public video on the device.
    ...(videoUrl && !hasRecipe
      ? { videoUrl, language: caption ? guessLanguage(caption) : null }
      : {}),
  };
}

async function getText(fetchPage: FetchPage, url: string, accept?: string): Promise<string | null> {
  try {
    const r = await fetchPage(url, accept ? { accept } : undefined);
    return r.status === 200 ? r.body : null;
  } catch {
    return null;
  }
}

/**
 * TikTok and YouTube: the caption/description (where creators write the recipe) comes from the
 * public video page; the oEmbed endpoint gives the title, author and thumbnail as a fallback.
 */
async function importVideo(
  fetchPage: FetchPage,
  url: URL,
  platform: 'tiktok' | 'youtube',
  draft: RecipeDraft,
): Promise<ImportResult> {
  const oembedUrl =
    platform === 'tiktok'
      ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url.toString())}`
      : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.toString())}`;
  const [pageHtml, oembedBody] = await Promise.all([
    getText(fetchPage, url.toString(), 'text/html,application/xhtml+xml'),
    getText(fetchPage, oembedUrl, 'application/json'),
  ]);
  let oembed: { title?: string; author_name?: string; thumbnail_url?: string } = {};
  try {
    if (oembedBody) oembed = JSON.parse(oembedBody) as typeof oembed;
  } catch {
    // Not JSON: ignore.
  }
  let caption: string | null = null;
  let author = oembed.author_name ?? null;
  let image = oembed.thumbnail_url ?? null;
  let subtitles: Subtitles | null = null;
  if (pageHtml && platform === 'tiktok') {
    const tt = tiktokCaption(pageHtml);
    caption = tt?.caption ?? null;
    author ??= tt?.author ?? null;
    image ??= tt?.image ?? null;
    subtitles = tt?.subtitles ?? null;
  }
  if (pageHtml && platform === 'youtube') {
    caption = youtubeDescription(pageHtml);
    subtitles = youtubeSubtitles(pageHtml);
  }
  // TikTok's oEmbed title is the caption itself; YouTube's is the video title.
  if (!caption && platform === 'tiktok') caption = oembed.title ?? null;

  draft.author = author;
  draft.imageUrl = image && /^https:\/\//.test(image) ? image : null;
  mergeCaption(draft, caption);
  // The parser's title guess is unreliable on captions: use the video title or first sentence.
  draft.title =
    (platform === 'youtube' && oembed.title ? oembed.title.slice(0, 200) : null) ??
    (caption ? captionTitle(caption) : null) ??
    draft.title;
  // Recipe explained out loud: complete what the caption lacks with the spoken words.
  let fromSpeech = false;
  if (subtitles && (!draft.ingredients.length || !draft.steps.length)) {
    const vtt = await getText(fetchPage, subtitles.url, 'text/vtt,*/*');
    const lines = vtt?.replace(/^\uFEFF/, '').startsWith('WEBVTT') ? vttToLines(vtt) : [];
    if (lines.length) {
      const spoken = recipeFromTranscript(lines);
      if (!draft.ingredients.length && spoken.ingredients.length) {
        draft.ingredients = spoken.ingredients;
        fromSpeech = true;
      }
      if (!draft.steps.length && spoken.steps.length) {
        draft.steps = spoken.steps;
        fromSpeech = true;
      }
      // The full transcript stays available to complete the recipe by hand.
      draft.notes = [draft.notes, `🎙️ ${spoken.text}`].filter(Boolean).join('\n\n').slice(0, 5000);
    }
  }
  const found = draft.ingredients.length > 0 || draft.steps.length > 0;
  return {
    draft,
    platform,
    completeness: found ? 'partial' : draft.title ? 'partial' : 'minimal',
    fromSpeech,
  };
}
