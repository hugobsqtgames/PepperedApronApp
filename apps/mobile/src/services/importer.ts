import { Directory, File, Paths } from 'expo-file-system';
import {
  importFromUrl,
  recipeFromTranscript,
  uuidv7,
  type FetchPage,
  type ImportResult,
} from '@pepperedapron/core';
import { transcribeVideo, videoSpeechAvailable } from '../../modules/video-speech';
import i18n from '../i18n';

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

/**
 * Instagram reel whose recipe is only said out loud: download the public video to the cache,
 * transcribe it with the phone's on-device speech recognition, delete it, and complete the
 * draft with the foods and cooking steps heard. Returns the result unchanged when not needed.
 */
export async function listenToVideo(
  res: ImportResult,
): Promise<{ result: ImportResult; error: VideoListenError | null }> {
  if (!res.videoUrl) return { result: res, error: null };
  if (!videoSpeechAvailable) return { result: res, error: 'unsupported' };
  const dir = new Directory(Paths.cache, 'video-import');
  const video = new File(dir, `${uuidv7()}.mp4`);
  try {
    if (!dir.exists) dir.create({ intermediates: true });
    await File.downloadFileAsync(res.videoUrl, video);
    const heard = await transcribeFile(video.uri, res.language);
    if ('error' in heard) return { result: res, error: heard.error };
    const spoken = recipeFromTranscript(heard.lines);
    const draft = { ...res.draft };
    if (!draft.ingredients.length) draft.ingredients = spoken.ingredients;
    if (!draft.steps.length) draft.steps = spoken.steps;
    draft.notes = [draft.notes, `🎙️ ${spoken.text}`].filter(Boolean).join('\n\n').slice(0, 5000);
    const found = spoken.ingredients.length > 0 || spoken.steps.length > 0;
    return {
      result: { ...res, draft, fromSpeech: found, completeness: 'partial' },
      error: null,
    };
  } catch (e) {
    return { result: res, error: listenError(e) };
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
): Promise<{ result: ImportResult; listenError: VideoListenError | null; offline: boolean }> {
  let networkErrors = 0;
  const res = await importFromUrl(
    pageFetcher(() => networkErrors++),
    url,
  );
  const offline = networkErrors > 0 && res.completeness === 'minimal';
  if (!res.videoUrl) return { result: res, listenError: null, offline };
  onListening();
  const { result, error } = await listenToVideo(res);
  return { result, listenError: error, offline };
}
