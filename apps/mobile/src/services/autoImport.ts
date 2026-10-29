import {
  emptyDraft,
  extractUrls,
  parseRecipeText,
  recipeFromTranscript,
  type DuplicateMatch,
  type ImportPlatform,
  type RecipeDraft,
  type ReviewNotice,
} from '@pepperedapron/core';
import { recipeFromDraft } from '@pepperedapron/client';
import { linkNotice } from '../features/recipe/notices';
import i18n from '../i18n';
import { importLinkFull, transcribeFile } from './importer';
import { ocrSupported, readTextFromImage } from './ocr';
import { photoFromUrl, preparePhoto } from './photos';
import { runtime } from './runtime';

/** What can be shared to the app (or imported in bulk). */
export type ImportSource =
  | { kind: 'link'; url: string; text: string | null; title: string | null }
  | { kind: 'text'; text: string; title: string | null }
  /** Screenshots or photos of one recipe (a carousel, several pages of a book). */
  | { kind: 'photos'; uris: string[] }
  /** A video file (saved from TikTok or Instagram): its speech is transcribed. */
  | { kind: 'video'; uri: string; text: string | null };

export type ImportStage = 'fetching' | 'listening' | 'reading' | 'saving';

export interface PreparedImport {
  draft: RecipeDraft;
  notice: ReviewNotice;
  localImageUri: string | null;
  platform: ImportPlatform | null;
  /** The site could not be reached (no network): nothing useful to save yet. */
  offline: boolean;
}

/** Below this many characters, a shared picture is the dish, not a screenshot of the recipe. */
const PHOTO_TEXT_LIMIT = 40;

/**
 * Turn what was shared into imports: several links in a text become several
 * imports, a link with its caption one import.
 */
export function sourcesFromShare(p: {
  text: string | null;
  url: string | null;
  title: string | null;
  images: string[];
  videos: string[];
}): ImportSource[] {
  if (p.images.length) return [{ kind: 'photos', uris: p.images.slice(0, 10) }];
  if (p.videos[0]) return [{ kind: 'video', uri: p.videos[0], text: p.text }];
  const urls = [...new Set([...(p.url ? [p.url] : []), ...extractUrls(p.text ?? '')])];
  if (urls.length > 1) return urls.map((url) => ({ kind: 'link', url, text: null, title: null }));
  if (urls[0]) return [{ kind: 'link', url: urls[0], text: p.text, title: p.title }];
  if (p.text?.trim()) return [{ kind: 'text', text: p.text, title: p.title }];
  return [];
}

function fromText(text: string, extra: Partial<RecipeDraft> = {}): RecipeDraft {
  const d = parseRecipeText(text);
  for (const [k, v] of Object.entries(extra))
    if (v !== null && v !== undefined) (d as unknown as Record<string, unknown>)[k] = v;
  return d;
}

function fromSpeech(lines: string[], extra: Partial<RecipeDraft> = {}): RecipeDraft {
  const spoken = recipeFromTranscript(lines);
  const d = { ...emptyDraft(), ...extra };
  d.ingredients = spoken.ingredients;
  d.steps = spoken.steps;
  d.notes = `🎙️ ${spoken.text}`.slice(0, 5000);
  return d;
}

/** Read what was shared and build the recipe draft (nothing is saved yet). */
export async function prepareImport(
  src: ImportSource,
  onStage: (s: ImportStage) => void = () => undefined,
): Promise<PreparedImport> {
  if (src.kind === 'text')
    return {
      draft: fromText(src.text, { title: src.title }),
      notice: 'text',
      localImageUri: null,
      platform: null,
      offline: false,
    };

  if (src.kind === 'link') {
    onStage('fetching');
    const { result, listenError, offline } = await importLinkFull(src.url, () =>
      onStage('listening'),
    );
    // Text shared alongside the link (a caption) complements what the page exposes.
    const extra = src.text?.replace(src.url, '').trim();
    if (extra && extra.length > 20 && !result.draft.ingredients.length) {
      return {
        draft: fromText(extra, {
          sourceUrl: result.draft.sourceUrl ?? src.url,
          source: result.draft.source,
          imageUrl: result.draft.imageUrl,
          author: result.draft.author,
          title: result.draft.title ?? src.title,
        }),
        notice: 'text',
        localImageUri: null,
        platform: result.platform,
        offline: false,
      };
    }
    const draft = result.draft;
    draft.title ??= src.title;
    return {
      draft,
      notice: linkNotice(result, listenError),
      localImageUri: null,
      platform: result.platform,
      offline,
    };
  }

  if (src.kind === 'video') {
    onStage('listening');
    const heard = await transcribeFile(src.uri);
    const caption = src.text?.trim() ? fromText(src.text) : null;
    if ('error' in heard) {
      return {
        draft: caption ?? emptyDraft(),
        notice:
          heard.error === 'permission'
            ? 'listenPermission'
            : heard.error === 'language'
              ? 'listenLanguage'
              : 'listenFailed',
        localImageUri: null,
        platform: null,
        offline: false,
      };
    }
    const d = fromSpeech(heard.lines, { title: caption?.title ?? null });
    if (caption?.ingredients.length) d.ingredients = caption.ingredients;
    if (caption?.steps.length) d.steps = caption.steps;
    return { draft: d, notice: 'speech', localImageUri: null, platform: null, offline: false };
  }

  // Photos: the text of every picture, in order, makes one recipe; a picture with (almost) no
  // text is the dish itself and becomes the recipe photo.
  onStage('reading');
  const canRead = await ocrSupported();
  const texts: string[] = [];
  let dish: string | null = null;
  for (const uri of src.uris) {
    let text = '';
    if (canRead) {
      try {
        text = await readTextFromImage(uri);
      } catch {
        text = '';
      }
    }
    if (text.length >= PHOTO_TEXT_LIMIT) texts.push(text);
    else dish ??= uri;
  }
  if (!texts.length)
    return {
      draft: emptyDraft(),
      notice: 'photo',
      localImageUri: dish ?? src.uris[0] ?? null,
      platform: null,
      offline: false,
    };
  return {
    draft: fromText(texts.join('\n\n')),
    notice: 'text',
    localImageUri: dish,
    platform: null,
    offline: false,
  };
}

const PLATFORM_NAMES: Record<ImportPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  pinterest: 'Pinterest',
  web: '',
};

/** A title is required: the draft's, else a readable placeholder the user can change. */
export function fallbackTitle(p: PreparedImport, now = new Date()): string {
  const t = p.draft.title?.trim();
  if (t) return t.slice(0, 200);
  const date = now.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' });
  const from =
    (p.platform && PLATFORM_NAMES[p.platform]) ||
    (p.draft.author ? `@${p.draft.author.replace(/^@/, '')}` : '');
  return from ? i18n.t('import.untitledFrom', { from, date }) : i18n.t('import.untitled', { date });
}

export interface SavedImport {
  recipeId: string;
  title: string;
  /** Already in the library: nothing was added (unless forced). */
  duplicate: DuplicateMatch | null;
}

/**
 * Save an import as a recipe straight away, with what to check flagged on the recipe. A recipe
 * already in the library (same link, or same title and ingredients) is not added twice.
 */
export async function saveImport(
  p: PreparedImport,
  opts: { force?: boolean; collection?: string | null } = {},
): Promise<SavedImport> {
  const s = runtime.session;
  if (!s) throw new Error('not_ready');
  const repos = s.repos;
  const data = recipeFromDraft(p.draft, repos.settings().defaultServings);
  data.title = fallbackTitle(p);
  data.review = p.notice === 'full' ? null : p.notice;
  const duplicate = repos.findDuplicate({
    // A placeholder title ("Recipe from 29 October") says nothing about the recipe.
    title: p.draft.title?.trim() ? data.title : '',
    sourceUrl: data.sourceUrl,
    ingredientNames: data.ingredients.map((i) => i.name),
  });
  if (duplicate && !opts.force) {
    const existing = repos.recipe(duplicate.id);
    if (opts.collection) await addToCollection(duplicate.id, opts.collection);
    return { recipeId: duplicate.id, title: existing?.data.title ?? data.title, duplicate };
  }
  // A photo failure never prevents saving the recipe.
  try {
    if (p.localImageUri) data.photoKey = await preparePhoto(p.localImageUri);
    else if (p.draft.imageUrl) data.photoKey = await photoFromUrl(p.draft.imageUrl);
  } catch {
    data.photoKey = null;
  }
  const rec = await repos.createRecipe(data);
  if (opts.collection) await addToCollection(rec.id, opts.collection);
  return { recipeId: rec.id, title: rec.data.title, duplicate: null };
}

/** Put a recipe in the collection of that name (created if needed), like on Instagram. */
async function addToCollection(recipeId: string, name: string) {
  const repos = runtime.session?.repos;
  if (!repos) return;
  const key = name.trim().toLowerCase();
  const found = repos.collections().find((c) => c.data.name.trim().toLowerCase() === key);
  const col = found ?? (await repos.createCollection(name.trim().slice(0, 80)));
  await repos.setInCollection(col.id, recipeId, true);
}

/**
 * A recipe dictated by the user: the first sentence is its name, the rest gives the ingredients
 * (with the quantities said) and the steps.
 */
export function draftFromDictation(lines: string[]): RecipeDraft {
  const [first = '', ...rest] = lines.map((l) => l.trim()).filter(Boolean);
  const title = first.replace(/[.,;:!?…]+$/, '').slice(0, 120) || null;
  return fromSpeech(rest.length ? rest : [first], { title });
}
