import { Directory, File, Paths } from 'expo-file-system';
import {
  importFromUrl,
  ingredientsFromScreenText,
  mergeIngredients,
  recipeFromTranscript,
  uuidv7,
  type DraftIngredient,
  type FetchPage,
  type ImportResult,
} from '@pepperedapron/core';
import { transcribeVideo, videoFrames, videoSpeechAvailable } from '../../modules/video-speech';
import i18n from '../i18n';
import { pickFrames } from '../lib/frames';
import { ocrSupported, readTextFromImage } from './ocr';

const TIMEOUT_MS = 12_000;
const MAX_CHARS = 3_000_000;

/**
 * Downloads a public page directly from the phone (no server in between). Only what any browser
 * would see is read: never cookies, never pages behind a login. `onNetworkError` tells the caller
 * the phone could not reach the site at all (offline), as opposed to a page without a recipe.
 */
const pageFetcher =
  (onNetworkError?: () => void): FetchPage =>
  async (url, opts) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        credentials: 'omit',
        headers: {
          Accept: opts?.accept ?? 'text/html',
          'Accept-Language': `${i18n.language},en;q=0.5`,
        },
      });
      const body = (await res.text()).slice(0, MAX_CHARS);
      return { status: res.status, contentType: res.headers.get('content-type'), body };
    } catch (e) {
      onNetworkError?.();
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };

/** Recipe draft from a link; offline or unreadable pages still give a draft with the link. */
export function importLink(url: string): Promise<ImportResult> {
  return importFromUrl(pageFetcher(), url);
}

const SPEECH_LOCALES = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', de: 'de-DE', it: 'it-IT' } as const;
type SpeechLanguage = keyof typeof SPEECH_LOCALES;

export type VideoListenError = 'unsupported' | 'permission' | 'language' | 'noAudio' | 'failed';

function listenError(e: unknown): VideoListenError {
  const code = (e as { code?: string }).code;
  return code === 'ERR_UNSUPPORTED'
    ? 'unsupported'
    : code === 'ERR_PERMISSION'
      ? 'permission'
      : code === 'ERR_LANGUAGE'
        ? 'language'
        : code === 'ERR_NO_AUDIO'
          ? 'noAudio'
          : 'failed';
}

/**
 * Transcribe a local video or audio file with the phone's on-device speech recognition (nothing
 * is sent). `language` defaults to the app language.
 */
export async function transcribeFile(
  uri: string,
  language?: string | null,
): Promise<{ lines: string[] } | { error: VideoListenError }> {
  if (!videoSpeechAvailable) return { error: 'unsupported' };
  const lang = (language ?? i18n.language.slice(0, 2)) as SpeechLanguage;
  try {
    const lines = await transcribeVideo(uri, SPEECH_LOCALES[lang] ?? 'fr-FR');
    return lines.length ? { lines } : { error: 'noAudio' };
  } catch (e) {
    return { error: listenError(e) };
  }
}

export interface VideoPictures {
  /** Ingredients written on the video ("200 g de farine" in an overlay). */
  ingredients: DraftIngredient[];
  /** Up to 6 pictures of the video for the recipe photo, sharpest and best exposed first. */
  frames: string[];
}

const FRAMES_PER_VIDEO = 60;

/**
 * Look at a video on the device: about one picture per second, the text written on each one read
 * by the phone's text recognition. Only the 6 pictures offered as the photo are kept on disk.
 */
export async function readVideoPictures(uri: string): Promise<VideoPictures> {
  if (!videoSpeechAvailable) return { ingredients: [], frames: [] };
  try {
    const frames = await videoFrames(uri, FRAMES_PER_VIDEO);
    const texts: string[][] = [];
    if (await ocrSupported())
      for (const f of frames) {
        try {
          texts.push((await readTextFromImage(f.uri)).split('\n'));
        } catch {
          // An unreadable picture: the others still count.
        }
      }
    const kept = pickFrames(frames);
    for (const f of frames) {
      if (kept.includes(f.uri)) continue;
      try {
        new File(f.uri).delete();
      } catch {
        // Caches folder: cleaned by the system anyway.
      }
    }
    return { ingredients: ingredientsFromScreenText(texts), frames: kept };
  } catch {
    return { ingredients: [], frames: [] };
  }
}

/**
 * Instagram reel: download the public video to the cache, take its pictures (the photo, text
 * written on it) and, when the caption lacks ingredients or steps, transcribe it with the
 * phone's on-device speech recognition to complete them. The video is then deleted.
 */
export async function listenToVideo(
  res: ImportResult,
): Promise<{ result: ImportResult; error: VideoListenError | null; frames: string[] }> {
  if (!res.videoUrl) return { result: res, error: null, frames: [] };
  if (!videoSpeechAvailable) return { result: res, error: 'unsupported', frames: [] };
  const dir = new Directory(Paths.cache, 'video-import');
  const video = new File(dir, `${uuidv7()}.mp4`);
  let pictures: VideoPictures = { ingredients: [], frames: [] };
  try {
    if (!dir.exists) dir.create({ intermediates: true });
    await File.downloadFileAsync(res.videoUrl, video);
    pictures = await readVideoPictures(video.uri);
    const draft = { ...res.draft };
    draft.ingredients = mergeIngredients(draft.ingredients, pictures.ingredients);
    const seen = pictures.ingredients.length > 0;
    // The caption has the whole recipe: the video only gives its pictures (the photo).
    if (res.listen === false)
      return { result: { ...res, draft }, error: null, frames: pictures.frames };
    const heard = await transcribeFile(video.uri, res.language);
    if ('error' in heard)
      return {
        result: seen ? { ...res, draft, completeness: 'partial' } : res,
        error: heard.error,
        frames: pictures.frames,
      };
    const spoken = recipeFromTranscript(heard.lines);
    // Quantities written on the video are more precise than what is said: they come first.
    draft.ingredients = mergeIngredients(draft.ingredients, spoken.ingredients);
    // Steps said in the video when the caption only lists the ingredients.
    if (!draft.steps.length) draft.steps = spoken.steps;
    draft.notes = [draft.notes, `🎙️ ${spoken.text}`].filter(Boolean).join('\n\n').slice(0, 5000);
    const found = spoken.ingredients.length > 0 || spoken.steps.length > 0;
    return {
      result: { ...res, draft, fromSpeech: found, completeness: 'partial' },
      error: null,
      frames: pictures.frames,
    };
  } catch (e) {
    return { result: res, error: listenError(e), frames: pictures.frames };
  } finally {
    try {
      if (video.exists) video.delete();
    } catch {
      // Cache folder: cleaned by the system anyway.
    }
  }
}

/**
 * Full link import: the page first, then — for a reel whose recipe is only said out loud —
 * listening to the video (`onListening` lets the screen say so, it takes a few seconds).
 * `offline` is true when the site could not be reached at all.
 */
export async function importLinkFull(
  url: string,
  onListening: () => void,
): Promise<{
  result: ImportResult;
  listenError: VideoListenError | null;
  offline: boolean;
  frames: string[];
}> {
  let networkErrors = 0;
  const res = await importFromUrl(
    pageFetcher(() => networkErrors++),
    url,
  );
  const offline = networkErrors > 0 && res.completeness === 'minimal';
  if (!res.videoUrl) return { result: res, listenError: null, offline, frames: [] };
  onListening();
  const { result, error, frames } = await listenToVideo(res);
  return { result, listenError: error, offline, frames };
}
