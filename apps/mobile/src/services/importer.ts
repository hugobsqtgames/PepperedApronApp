import { Directory, File, Paths } from 'expo-file-system';
import {
  importFromUrl,
  ingredientsFromScreenText,
  bestTitle,
  chooseVideoRecipe,
  fuseVideoRecipe,
  fusionSummary,
  groundModelRecipe,
  isHook,
  modelPrompt,
  pruneCaptionNotes,
  recipeFromTranscript,
  titleFromScreen,
  uuidv7,
  type DraftIngredient,
  type FetchPage,
  type ImportResult,
  type RecipeDraft,
  type ScreenFrame,
  type SpeechSegment,
  type VideoEvidence,
} from '@pepperedapron/core';
import {
  transcribeVideo,
  transcribeVideoTimed,
  videoFrames,
  videoSpeechAvailable,
} from '../../modules/video-speech';
import { recipeModelAvailability, structureRecipe } from '../../modules/recipe-model';
import i18n from '../i18n';
import { pickFrames } from '../lib/frames';
import { ocrSupported, readTextFromImage, readTextLines } from './ocr';

const TIMEOUT_MS = 12_000;
const MAX_CHARS = 3_000_000;

/**
 * Downloads a public page directly from the phone (no server in between). Only what any browser
 * would see is read: never cookies, never pages behind a login. `onNetworkError` tells the caller
 * the phone could not reach the site at all (offline), as opposed to a page without a recipe.
 */
const pageFetcher =
  (
    onNetworkError?: () => void,
    onFailure?: () => void,
    timeoutMs: number = TIMEOUT_MS,
  ): FetchPage =>
  async (url, opts) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
      // Any page not read (slow or refused): the import is tried again before being saved.
      onFailure?.();
      // A site that is slow to answer is not the phone being offline.
      if ((e as Error).name !== 'AbortError') onNetworkError?.();
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };

/**
 * Whether the phone can reach the internet at all, checked with Apple's own connectivity page
 * (the one iOS uses for Wi-Fi portals): nothing is sent but the request itself.
 */
export async function internetReachable(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch('https://captive.apple.com/hotspot-detect.html', {
      method: 'HEAD',
      signal: ctrl.signal,
      credentials: 'omit',
    });
    return res.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

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
): Promise<{ lines: string[]; phrases: SpeechSegment[] } | { error: VideoListenError }> {
  if (!videoSpeechAvailable) return { error: 'unsupported' };
  const lang = (language ?? i18n.language.slice(0, 2)) as SpeechLanguage;
  const locale = SPEECH_LOCALES[lang] ?? 'fr-FR';
  try {
    // With the time of each phrase when the build has it (the fusion orders steps by it).
    const phrases: SpeechSegment[] =
      typeof transcribeVideoTimed === 'function'
        ? await transcribeVideoTimed(uri, locale)
        : (await transcribeVideo(uri, locale)).map((text, i) => ({
            text,
            start: i * 4,
            end: i * 4 + 4,
          }));
    const lines = phrases.map((p) => p.text).filter(Boolean);
    return lines.length ? { lines, phrases } : { error: 'noAudio' };
  } catch (e) {
    return { error: listenError(e) };
  }
}

/**
 * What a video says, in the language that understands it best: the language guessed from the
 * caption first, then the app's language. A French reel captioned "#pasta #recipe" was listened
 * to in English, and nothing usable came out of it.
 */
export async function transcribeBest(
  uri: string,
  guessed?: string | null,
): Promise<
  | {
      lines: string[];
      phrases: SpeechSegment[];
      spoken: ReturnType<typeof recipeFromTranscript>;
      language: string;
    }
  | { error: VideoListenError }
> {
  const app = i18n.language.slice(0, 2);
  const tries = [...new Set([guessed ?? app, app])].filter((l) => l in SPEECH_LOCALES);
  let best: {
    lines: string[];
    phrases: SpeechSegment[];
    spoken: ReturnType<typeof recipeFromTranscript>;
    language: string;
  } | null = null;
  let firstError: VideoListenError | null = null;
  for (const language of tries) {
    const heard = await transcribeFile(uri, language);
    if ('error' in heard) {
      firstError ??= heard.error;
      // No permission, no speech at all: another language will not change it.
      if (
        heard.error === 'permission' ||
        heard.error === 'unsupported' ||
        heard.error === 'noAudio'
      )
        break;
      continue;
    }
    const spoken = recipeFromTranscript(heard.lines);
    const score = spoken.steps.length * 2 + spoken.ingredients.length;
    if (!best || score > best.spoken.steps.length * 2 + best.spoken.ingredients.length)
      best = { lines: heard.lines, phrases: heard.phrases, spoken, language };
    // Heard in the app's language with steps: that is the one (another would only cost time).
    if (language === app && best.language === app && best.spoken.steps.length) break;
  }
  return best ?? { error: firstError ?? 'failed' };
}

export interface VideoPictures {
  /** Ingredients written on the video ("200 g de farine" in an overlay). */
  ingredients: DraftIngredient[];
  /** The dish's name written on the video ("PENNE AU POULET"), if any. */
  title?: string | null;
  /** Up to 6 pictures of the video for the recipe photo, sharpest and best exposed first. */
  frames: string[];
  /** The text read on each picture, with its place and time (for the fusion). */
  screen?: ScreenFrame[];
}

/** Pictures taken from a video: about one every 2 s of a one-minute reel. */
const FRAMES_PER_VIDEO = 30;
/** Pictures whose text is read (the slow part): text on a reel stays several seconds. */
const FRAMES_READ = 24;

/**
 * Look at a video on the device: about one picture every 2 seconds, the text written on 20 of them read
 * by the phone's text recognition. Only the 6 pictures offered as the photo are kept on disk.
 */
export async function readVideoPictures(uri: string): Promise<VideoPictures> {
  if (!videoSpeechAvailable) return { ingredients: [], frames: [] };
  try {
    const frames = await videoFrames(uri, FRAMES_PER_VIDEO);
    const texts: string[][] = [];
    const screen: ScreenFrame[] = [];
    // Evenly spread over the video, so a text shown only at the end is still seen.
    const step = Math.max(1, frames.length / FRAMES_READ);
    const toRead = frames.filter((_, i) => i % step < 1).slice(0, FRAMES_READ);
    if (await ocrSupported())
      for (const f of toRead) {
        try {
          // With the place of each line and how sure the reader is, when the build has it.
          const placed = await readTextLines(f.uri);
          const lines = placed
            ? placed
            : (await readTextFromImage(f.uri))
                .split('\n')
                .map((text) => ({ text, x: 0, y: 0, width: 0, height: 0 }));
          texts.push(lines.map((l) => l.text));
          screen.push({ time: f.time, lines });
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
    return {
      ingredients: ingredientsFromScreenText(texts),
      title: titleFromScreen(texts),
      frames: kept,
      screen,
    };
  } catch {
    return { ingredients: [], frames: [] };
  }
}

/** What the on-device model is told (the evidence follows in the prompt). */
const MODEL_INSTRUCTIONS = [
  'Tu es un assistant de cuisine. Tu reçois trois sources sur une même recette en vidéo : le texte de la publication, le texte écrit sur la vidéo (avec l’instant où il apparaît) et ce qui est dit dans la vidéo (avec l’instant).',
  'Compare les trois et écris la recette complète.',
  'Règles : utilise uniquement ce que disent les sources. N’invente aucun ingrédient, aucune quantité, aucune étape.',
  'Quand les quantités diffèrent, préfère celle qui est écrite (publication ou vidéo) à celle qui est entendue.',
  'Ignore les salutations, les appels à s’abonner, les noms de compte et le nom des applications.',
  'Les étapes sont des instructions courtes, dans l’ordre de la vidéo. Écris dans la langue de la recette.',
].join('\n');

/** The model may take a while on a long video: past this, the fused version is kept. */
const MODEL_TIMEOUT_MS = 30_000;

/**
 * The post, the text on the video and what is said put together (see fuseVideoRecipe), then,
 * when the iPhone has Apple's on-device model, its version checked against the three sources
 * and taken where it is better. Returns the recipe and lines for the import log.
 */
export async function fuseVideo(
  caption: RecipeDraft,
  pictures: VideoPictures,
  phrases: SpeechSegment[],
): Promise<{ draft: RecipeDraft; trace: string[]; spokenText: string }> {
  const evidence: VideoEvidence = { caption, screen: pictures.screen ?? [], speech: phrases };
  const fused = fuseVideoRecipe(evidence);
  const trace: string[] = [];
  let fromModel: string[] = [];
  let draft = fused.draft;
  const worthAsking = fused.screen.some((t) => t.kind !== 'chrome') || phrases.length > 0;
  const availability = worthAsking ? await recipeModelAvailability() : 'unavailable:nothing';
  if (availability === 'available') {
    try {
      const answer = await Promise.race([
        structureRecipe(MODEL_INSTRUCTIONS, modelPrompt(evidence, fused)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), MODEL_TIMEOUT_MS),
        ),
      ]);
      const grounded = groundModelRecipe(
        {
          title: answer.title ?? null,
          servings: answer.servings ?? null,
          ingredients: (answer.ingredients ?? []).map((i) => ({
            name: i.name,
            quantity: i.quantity ?? null,
            unit: i.unit ?? null,
          })),
          steps: answer.steps ?? [],
        },
        evidence,
        fused,
      );
      const chosen = chooseVideoRecipe(fused, grounded);
      draft = chosen.draft;
      fromModel = chosen.fromModel;
      trace.push(`model: ${grounded.dropped.length} invented line(s) dropped`);
    } catch (e) {
      trace.push(`model: ${(e as Error).message.slice(0, 80)}`);
    }
  } else trace.push(`model: ${availability}`);
  trace.unshift(fusionSummary(fused, fromModel));
  // The dish named in the caption's hook or in what is said, when nothing better was found.
  if (!draft.title || isHook(draft.title))
    draft = {
      ...draft,
      title: bestTitle({ captionFirst: draft.title, speech: fused.spokenText }) ?? draft.title,
    };
  return { draft, trace, spokenText: fused.spokenText };
}

/**
 * Instagram reel: download the public video to the cache, take its pictures (the photo, text
 * written on it) and, when the caption lacks ingredients or steps, transcribe it with the
 * phone's on-device speech recognition to complete them. The video is then deleted.
 */
export async function listenToVideo(res: ImportResult): Promise<{
  result: ImportResult;
  error: VideoListenError | null;
  frames: string[];
  trace?: string[];
}> {
  if (!res.videoUrl) return { result: res, error: null, frames: [] };
  if (!videoSpeechAvailable) return { result: res, error: 'unsupported', frames: [] };
  const dir = new Directory(Paths.cache, 'video-import');
  const video = new File(dir, `${uuidv7()}.mp4`);
  let pictures: VideoPictures = { ingredients: [], frames: [] };
  try {
    if (!dir.exists) dir.create({ intermediates: true });
    // The video too can fail on the first try: once more before giving up on what it says.
    try {
      await File.downloadFileAsync(res.videoUrl, video);
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
      if (video.exists) video.delete();
      await File.downloadFileAsync(res.videoUrl, video);
    }
    pictures = await readVideoPictures(video.uri);
    // The caption has the whole recipe: the video only gives its pictures and its text.
    const heard = res.listen === false ? null : await transcribeBest(video.uri, res.language);
    const phrases = heard && !('error' in heard) ? heard.phrases : [];
    const { draft, trace, spokenText } = await fuseVideo(res.draft, pictures, phrases);
    const found = phrases.length > 0 && (draft.steps.length > 0 || draft.ingredients.length > 0);
    if (heard === null)
      return { result: { ...res, draft }, error: null, frames: pictures.frames, trace };
    if ('error' in heard) {
      const seen = draft.ingredients.length > res.draft.ingredients.length;
      return {
        result: seen ? { ...res, draft, completeness: 'partial' } : res,
        error: heard.error,
        frames: pictures.frames,
        trace,
      };
    }
    if (draft.ingredients.length && draft.steps.length)
      // Complete now: the notes keep only what the recipe does not already say.
      draft.notes = pruneCaptionNotes(draft.notes, draft);
    // Nothing usable heard: the transcript stays in the notes, to complete the recipe by hand.
    else if (spokenText)
      draft.notes = [draft.notes, `🎙️ ${spokenText}`].filter(Boolean).join('\n\n').slice(0, 5000);
    return {
      result: { ...res, draft, fromSpeech: found, completeness: 'partial' },
      error: null,
      frames: pictures.frames,
      trace,
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

/** A link read again when a page failed: right away, then a little later, with more time. */
const LINK_RETRY_DELAYS_MS = [1500, 4000];
const RETRY_TIMEOUT_MS = 20_000;

/** Nothing more to hope from reading the page again. */
const isComplete = (r: ImportResult) => r.draft.ingredients.length > 0 && r.draft.steps.length > 0;

/** How much a reading of the link gives: a video to listen to counts as much as steps. */
const richness = (r: ImportResult) =>
  (r.draft.steps.length ? 4 : 0) +
  (r.draft.ingredients.length ? 4 : 0) +
  (r.videoUrl ? 4 : 0) +
  (r.draft.title ? 1 : 0) +
  (r.draft.imageUrl ? 1 : 0);

/**
 * Full link import: the page first, then — for a reel whose recipe is only said out loud —
 * listening to the video (`onListening` lets the screen say so, it takes a few seconds).
 * `offline` is true when the site could not be reached at all.
 */
export async function importLinkFull(
  url: string,
  onListening: () => void,
  retryDelaysMs: number[] = LINK_RETRY_DELAYS_MS,
): Promise<{
  result: ImportResult;
  listenError: VideoListenError | null;
  offline: boolean;
  frames: string[];
  /** What was found, for the import log (Help → "Send the import log"). */
  trace: string[];
}> {
  const trace: string[] = [];
  let networkErrors = 0;
  let failures = 0;
  let reads = 1;
  let res = await importFromUrl(
    pageFetcher(
      () => networkErrors++,
      () => failures++,
    ),
    url,
  );
  // A page of the post not read (the site slow or cutting the connection, often on the first
  // try): the video, its subtitles, the caption may all be missing. It is read again at once,
  // with more time, before saving anything — the best reading is kept.
  for (const delay of retryDelaysMs) {
    if (!failures || isComplete(res)) break;
    if (networkErrors && !(await internetReachable())) break;
    await new Promise((r) => setTimeout(r, delay));
    trace.push(`read ${reads}: ${failures} page(s) not read`);
    reads++;
    failures = 0;
    networkErrors = 0;
    const again = await importFromUrl(
      pageFetcher(
        () => networkErrors++,
        () => failures++,
        RETRY_TIMEOUT_MS,
      ),
      url,
    );
    if (richness(again) >= richness(res)) res = again;
  }
  // A site refusing the connection looks like no network: the phone is only called offline
  // when it cannot reach Apple's own connectivity check either. Otherwise what could be read is
  // saved now, instead of waiting minutes for a site that will not answer.
  const offline =
    networkErrors > 0 && res.completeness === 'minimal' && !(await internetReachable());
  const d = res.draft;
  trace.push(
    `${res.platform} ${res.completeness}: ${d.ingredients.length} ingr, ${d.steps.length} steps` +
      `${res.fromSpeech ? ' (from subtitles)' : ''}, video ${res.videoUrl ? 'yes' : 'no'}` +
      `${res.videoUrl ? `, listen ${res.listen === false ? 'no' : 'yes'} (${res.language ?? '?'})` : ''}` +
      `${failures ? `, ${failures} page(s) not read` : ''}${offline ? ', offline' : ''}`,
  );
  if (!res.videoUrl) return { result: res, listenError: null, offline, frames: [], trace };
  onListening();
  const { result, error, frames, trace: fusion } = await listenToVideo(res);
  trace.push(...(fusion ?? []));
  trace.push(
    error
      ? `video: ${error}`
      : `video: ${result.draft.ingredients.length} ingr, ${result.draft.steps.length} steps, ${frames.length} pictures`,
  );
  return { result, listenError: error, offline, frames, trace };
}
