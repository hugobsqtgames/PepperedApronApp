import { parseTimerSeconds } from '../duration';
import { ingredientKey, normalizeText, singularize, tokenize } from '../text';
import type { DraftIngredient, DraftStep, RecipeDraft } from './draft';
import { parseIngredientLine } from './ingredient';
import type { PlacedLine } from './ocrLayout';
import { cleanTitle, dishPhrase, isHook, isHookSentence } from './title';
import { isCookingStep, recipeFromTranscript, SPOKEN_NUMBERS } from './transcript';

/**
 * A recipe video read three ways on the phone, then put together field by field:
 * - what the post says (caption, description, subtitles): written by the author;
 * - the text written on the video (read on about one picture a second, with its place and how
 *   sure the reader is): exact quantities, often the steps;
 * - what is said (on-device speech recognition, with times): the method, in order.
 * Each field is taken from the source that is best for it, confirmed by the others, and the
 * report says where each part came from. An on-device language model may also propose a
 * version (see groundModelRecipe): it is checked against these three sources word by word, and
 * only kept where it is better and invents nothing.
 */

export type VideoSource = 'caption' | 'screen' | 'speech' | 'model';

export interface ScreenLine extends PlacedLine {
  /** How sure the text reader is, 0–1. */
  confidence?: number;
}

/** The text read on one picture of the video. */
export interface ScreenFrame {
  /** Seconds from the start. */
  time: number;
  lines: ScreenLine[];
}

/** A phrase said in the video, between two pauses. */
export interface SpeechSegment {
  text: string;
  /** Seconds from the start. */
  start: number;
  end: number;
  /** How sure the recognition is, 0–1. */
  confidence?: number;
}

export interface VideoEvidence {
  /** What the post itself gave (caption, description, subtitles). */
  caption: RecipeDraft;
  screen: ScreenFrame[];
  speech: SpeechSegment[];
}

export type ScreenKind = 'ingredient' | 'step' | 'title' | 'chrome' | 'other';

/** A text shown on the video, followed over the pictures where it stays. */
export interface ScreenText {
  text: string;
  kind: ScreenKind;
  /** When it appears and disappears (seconds). */
  first: number;
  last: number;
  /** On how many pictures it was read. */
  frames: number;
  /** 0–1: read on several pictures with a sure reading = high. */
  weight: number;
  /** Place on the picture (0 top – 1 bottom). */
  y: number;
}

// ---------------------------------------------------------------------------------------------
// Text similarity, tolerant to reading errors ("farlne" for "farine").

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1),
      );
    prev = cur;
  }
  return prev[b.length]!;
}

/** 1 for the same text, 0 for nothing in common (characters, after normalising). */
export function textSimilarity(a: string, b: string): number {
  const x = normalizeText(a).replace(/[^\p{L}\p{N} ]/gu, '');
  const y = normalizeText(b).replace(/[^\p{L}\p{N} ]/gu, '');
  if (!x.length && !y.length) return 1;
  const longest = Math.max(x.length, y.length);
  // Too different in length to be the same line read twice.
  if (Math.min(x.length, y.length) / longest < 0.6) return 0;
  return 1 - levenshtein(x, y) / longest;
}

const STOP = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'un',
  'une',
  'et',
  'en',
  'au',
  'aux',
  'a',
  'dans',
  'sur',
  'avec',
  'pour',
  'puis',
  'the',
  'of',
  'and',
  'to',
  'in',
  'on',
  'with',
  'for',
  'then',
  'a',
  'an',
  'd',
  'l',
  'it',
  'is',
  'est',
  'on',
  'je',
  'vous',
  'tu',
  'il',
  'elle',
  'ce',
  'ca',
  'cette',
  'mon',
  'ma',
  'mes',
  'votre',
  'vos',
  'bien',
  'tout',
  'tous',
  'very',
  'your',
  'you',
  'we',
  'i',
]);

/** The meaningful words of a text, singular, without accents ("Les tomates" → ["tomate"]). */
export function contentWords(text: string): string[] {
  return tokenize(text)
    .map(singularize)
    .filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

// ---------------------------------------------------------------------------------------------
// Text on the video.

/** The app's buttons and counters filmed with the video, handles, hashtags, music credits. */
const CHROME =
  /(^|\s)[@#]\w|https?:|www\.|^\s*[\d.,]+\s*[kKmM]?\s*$|^(suivre|follow|abonne|abonnez|like|j'aime|partager|share|commentaires?|comments?|reply|repondre|envoyer|send|tiktok|instagram|reels?|son original|original sound|musique|music|voir la traduction|see translation|sponsoris|ad|pub)\b/i;
/** "8 min", "180°C", "x2": times and temperatures written on a video are not ingredients. */
const NOT_FOOD =
  /^\d+([.,]\d+)?\s*(min|mins|minutes?|h|heures?|hours?|s|sec|secondes?|seconds?|°|degr|x\b)/i;
/** "1.", "2)", "Étape 3 :", "Step 4 -" before a step written on the video. */
const STEP_NUMBER = /^\s*(?:(?:etape|étape|step)\s*\d+\s*[:.)\-–]?|\d{1,2}\s*[.)\-–:]|[①-⑳])\s*/i;

function screenIngredient(text: string): DraftIngredient | null {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length < 3 || line.length > 80 || line.split(' ').length > 10) return null;
  if (NOT_FOOD.test(line)) return null;
  const p = parseIngredientLine(line.replace(/^[-–•*·]\s*/, ''));
  if (!p || p.quantity === null || !/\p{L}{2}/u.test(p.name) || p.name.length > 40) return null;
  // A sentence with a number in it ("Cuire 10 min à feu doux") is a step, not an ingredient.
  if (isCookingStep(line) && contentWords(p.name).length > 3) return null;
  return { group: null, ...p };
}

function classify(text: string, first: number, duration: number): ScreenKind {
  if (CHROME.test(text) || !/\p{L}{2}/u.test(text)) return 'chrome';
  if (screenIngredient(text)) return 'ingredient';
  const body = text.replace(STEP_NUMBER, '');
  if (body.split(/\s+/).length >= 3 && isCookingStep(body)) return 'step';
  if (
    !/\d/.test(text) &&
    text.length <= 50 &&
    text.split(/\s+/).length <= 6 &&
    first <= Math.max(6, duration * 0.4) &&
    dishPhrase(text)
  )
    return 'title';
  return 'other';
}

/**
 * Follows each text over the pictures of the video: the same line read on ten pictures is one
 * text (its best reading wins), a line shown on almost every picture at the same place is the
 * app's interface or a watermark, a line read once with doubt is dropped.
 */
export function trackScreenText(frames: ScreenFrame[]): ScreenText[] {
  const sorted = [...frames].sort((a, b) => a.time - b.time);
  if (!sorted.length) return [];
  const duration = sorted[sorted.length - 1]!.time + 1;
  const gap = Math.max(4, (duration / sorted.length) * 3);
  interface Track {
    variants: Map<string, number>;
    first: number;
    last: number;
    frames: number;
    conf: number;
    y: number;
  }
  const tracks: Track[] = [];
  for (const frame of sorted) {
    // A text written over two lines is one text; two texts one under the other (a hook over the
    // dish's name) stay two: unlike a printed page, overlays are short and stacked.
    const lines = joinContinuations(frame.lines.filter((l) => l.text.trim()));
    const used = new Set<Track>();
    for (const src of lines) {
      const text = src.text.replace(/\s+/g, ' ').trim();
      const conf = src.confidence ?? 0.8;
      const y = src.y;
      let best: Track | null = null;
      let bestSim = 0.78;
      for (const t of tracks) {
        if (used.has(t) || frame.time - t.last > gap) continue;
        const [lead] = [...t.variants.entries()].sort((a, b) => b[1] - a[1])[0]!;
        const sim = textSimilarity(lead, text);
        if (sim > bestSim) {
          bestSim = sim;
          best = t;
        }
      }
      if (best) {
        best.variants.set(text, (best.variants.get(text) ?? 0) + conf);
        best.last = frame.time;
        best.frames++;
        best.conf += conf;
        used.add(best);
      } else {
        const t: Track = {
          variants: new Map([[text, conf]]),
          first: frame.time,
          last: frame.time,
          frames: 1,
          conf,
          y,
        };
        tracks.push(t);
        used.add(t);
      }
    }
  }
  const out: ScreenText[] = [];
  for (const t of tracks) {
    const text = bestReading(t.variants);
    const conf = t.conf / t.frames;
    // Read once, unsure: a blur, a reflection, half a word.
    if (t.frames === 1 && conf < 0.5) continue;
    let kind = classify(text, t.first, duration);
    // On (almost) every picture: the account's name, a watermark, the app's buttons.
    if (
      kind !== 'ingredient' &&
      kind !== 'step' &&
      sorted.length >= 6 &&
      t.frames >= sorted.length * 0.7
    )
      kind = 'chrome';
    const weight = Math.min(1, conf * (0.55 + 0.15 * Math.min(t.frames, 3)));
    out.push({ text, kind, first: t.first, last: t.last, frames: t.frames, weight, y: t.y });
  }
  // A piece of a longer text shown at the same time ("Melt the butter in a" of "Melt the butter
  // in a large pan…") is not a text of its own.
  const norm = (x: string) =>
    normalizeText(x)
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .trim();
  const kept = out.filter(
    (a) =>
      !out.some(
        (b) =>
          b !== a &&
          b.text.length > a.text.length + 3 &&
          b.first <= a.last + gap &&
          a.first <= b.last + gap &&
          norm(b.text).includes(norm(a.text)),
      ),
  );
  return kept.sort((a, b) => a.first - b.first || a.y - b.y);
}

/**
 * Lines of one picture that continue each other ("Melt the butter in a" / "large pan over
 * medium heat."): the next one starts with a small letter or the first ends on a small word,
 * and it sits right under it.
 */
function joinContinuations(lines: ScreenLine[]): ScreenLine[] {
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const out: ScreenLine[] = [];
  for (const l of sorted) {
    const prev = out[out.length - 1];
    const text = l.text.trim();
    if (prev) {
      const gapY = l.y - (prev.y + prev.height);
      const below = gapY >= -0.01 && gapY < Math.max(prev.height, l.height) * 1.2;
      const aligned = Math.abs(l.x - prev.x) < 0.12;
      const lastWord = normalizeText(prev.text.trim().split(/\s+/).pop() ?? '');
      const opens = /[.!?:;…)]$/.test(prev.text.trim());
      const continues =
        /^\p{Ll}/u.test(text) ||
        (!opens &&
          /^(a|an|the|of|and|in|on|with|de|du|des|la|le|les|un|une|et|a|au|aux|dans|sur|avec|en|pour|puis)$/.test(
            lastWord,
          ));
      if (below && aligned && !opens && continues) {
        out[out.length - 1] = {
          ...prev,
          text: `${prev.text.trim()} ${text}`,
          width: Math.max(prev.width, l.width),
          height: l.y + l.height - prev.y,
          confidence: Math.min(prev.confidence ?? 0.8, l.confidence ?? 0.8),
        };
        continue;
      }
    }
    out.push(l);
  }
  return out;
}

/** The reading kept for a text: seen most (case aside), in its written case rather than capitals. */
function bestReading(variants: Map<string, number>): string {
  const byKey = new Map<string, { score: number; forms: [string, number][] }>();
  for (const [text, score] of variants) {
    const k = normalizeText(text);
    const e = byKey.get(k) ?? { score: 0, forms: [] };
    e.score += score;
    e.forms.push([text, score]);
    byKey.set(k, e);
  }
  const best = [...byKey.values()].sort((a, b) => b.score - a.score)[0]!;
  const mixed = best.forms.filter(([t]) => t !== t.toUpperCase());
  const pool = mixed.length ? mixed : best.forms;
  return pool.sort((a, b) => b[1] - a[1])[0]![0];
}

// ---------------------------------------------------------------------------------------------
// Ingredients.

interface IngredientCandidate {
  ing: DraftIngredient;
  source: Exclude<VideoSource, 'model'>;
  weight: number;
  order: number;
}

const SOURCE_RANK: Record<VideoSource, number> = { caption: 3, screen: 2, model: 1.5, speech: 1 };

function sameIngredient(a: string, b: string): boolean {
  const ka = ingredientKey(a);
  const kb = ingredientKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const wa = contentWords(a);
  const wb = contentWords(b);
  if (!wa.length || !wb.length) return false;
  // "farine" and "farine de blé T55": the same food, one more precise.
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (short[0] === long[0] && short.every((w) => long.includes(w))) return true;
  // A reading error of a letter or two on a long word ("mozarella", "farlne").
  return (
    wa.length === wb.length &&
    wa.every((w, i) => {
      const v = wb[i]!;
      return w === v || (w.length >= 5 && levenshtein(w, v) <= Math.floor(w.length / 5));
    })
  );
}

const sameAmount = (a: DraftIngredient, b: DraftIngredient) =>
  a.quantity !== null &&
  a.quantity === b.quantity &&
  normalizeText(a.unit ?? '') === normalizeText(b.unit ?? '');

export interface IngredientProvenance {
  name: string;
  /** Where the name came from. */
  source: VideoSource;
  /** Where the quantity came from (null: none known). */
  quantityFrom: VideoSource | null;
  /** Sources that name it too. */
  confirmedBy: VideoSource[];
  /** Different quantities seen ("200 g" written, "250 g" said). */
  conflict: boolean;
}

function fuseIngredients(cands: IngredientCandidate[]): {
  ingredients: DraftIngredient[];
  provenance: IngredientProvenance[];
} {
  const groups: IngredientCandidate[][] = [];
  for (const c of cands) {
    const g = groups.find((gr) => gr.some((x) => sameIngredient(x.ing.name, c.ing.name)));
    if (g) g.push(c);
    else groups.push([c]);
  }
  const ingredients: DraftIngredient[] = [];
  const provenance: IngredientProvenance[] = [];
  const ranked = groups
    .map((g) => {
      // The name the author wrote, else the one written on the video, else the one said.
      const named = [...g].sort(
        (a, b) =>
          SOURCE_RANK[b.source] - SOURCE_RANK[a.source] || b.ing.name.length - a.ing.name.length,
      )[0]!;
      const withQty = g.filter((c) => c.ing.quantity !== null);
      let qty: IngredientCandidate | null = null;
      let best = -1;
      for (const c of withQty) {
        const agree = withQty.filter((o) => o !== c && sameAmount(o.ing, c.ing)).length;
        const score = SOURCE_RANK[c.source] * c.weight + agree * 1.5;
        if (score > best) {
          best = score;
          qty = c;
        }
      }
      const conflict = withQty.some((c) => qty && !sameAmount(c.ing, qty.ing));
      const order = Math.min(...g.map((c) => SOURCE_RANK[c.source] * -1000 + c.order));
      return { g, named, qty, conflict, order };
    })
    .sort((a, b) => a.order - b.order);
  for (const r of ranked) {
    ingredients.push({
      ...r.named.ing,
      quantity: r.qty ? r.qty.ing.quantity : r.named.ing.quantity,
      quantityMax: r.qty ? r.qty.ing.quantityMax : r.named.ing.quantityMax,
      unit: r.qty ? r.qty.ing.unit : r.named.ing.unit,
    });
    provenance.push({
      name: r.named.ing.name,
      source: r.named.source,
      quantityFrom: r.qty?.source ?? null,
      confirmedBy: [...new Set(r.g.map((c) => c.source))].filter((s) => s !== r.named.source),
      conflict: r.conflict,
    });
  }
  return { ingredients, provenance };
}

// ---------------------------------------------------------------------------------------------
// Steps.

/**
 * How good a list of steps is as a method: real instructions (verbs), covering the recipe's
 * ingredients, neither fragments nor walls of text. 0 for none.
 */
export function stepsQuality(steps: { text: string }[], ingredients: DraftIngredient[]): number {
  if (!steps.length) return 0;
  const cooking = steps.filter((s) => isCookingStep(s.text)).length / steps.length;
  const text = new Set(steps.flatMap((s) => contentWords(s.text)));
  const named = ingredients.filter((i) => {
    const ws = contentWords(i.name);
    return ws.length > 0 && ws.some((w) => text.has(w));
  }).length;
  const coverage = ingredients.length ? named / ingredients.length : 0.5;
  const avgWords = steps.reduce((n, s) => n + s.text.split(/\s+/).length, 0) / steps.length;
  const shape = avgWords < 4 ? 0.5 : avgWords > 70 ? 0.6 : 1;
  const count = Math.pow(Math.min(steps.length, 15), 0.6);
  return count * (0.3 + cooking) * (0.6 + 0.4 * coverage) * shape;
}

/**
 * What is said around an instruction: "Ensuite on va éplucher…", "Et là il faut faire chauffer…",
 * "Now you want to add…" → "Éplucher…", "Faire chauffer…", "Add…".
 */
const SPOKEN_LEAD =
  /^(?:(?:et|alors|ensuite|puis|apres|après|maintenant|donc|bon|ok|voila|voilà|et puis|et la|et là|la|là|enfin|now|then|so|next|and|after that|okay|ok so)[\s,]+)*(?:(?:on va|il faut|il va falloir|tu vas|vous allez|je vais|we(?:'re going to| are going to)?|you(?:'re going to| want to| need to| are going to)?|i(?:'m going to| am going to)?|let's)\s+)?/i;

const step = (text: string): DraftStep => {
  let clean = text.replace(STEP_NUMBER, '').trim();
  const lead = SPOKEN_LEAD.exec(clean)?.[0] ?? '';
  // Only when what is left is still an instruction ("Ensuite on ajoute" stays as it is).
  if (lead && isCookingStep(clean.slice(lead.length))) clean = clean.slice(lead.length);
  const t = clean.charAt(0).toUpperCase() + clean.slice(1);
  return { group: null, text: t, timerSeconds: parseTimerSeconds(t), timerLabel: null };
};

/** When each spoken step starts in the video, from the phrase it begins with. */
function timeOfSpoken(text: string, segments: SpeechSegment[]): number {
  const head = contentWords(text).slice(0, 4);
  let best = { t: Infinity, score: 0 };
  for (const s of segments) {
    const ws = contentWords(s.text);
    const score = head.filter((w) => ws.includes(w)).length;
    if (score > best.score) best = { t: s.start, score };
  }
  return best.score >= Math.min(2, head.length) ? best.t : Infinity;
}

const similarStep = (a: string, b: string) => jaccard(contentWords(a), contentWords(b)) >= 0.45;

// ---------------------------------------------------------------------------------------------
// The whole recipe.

export interface FusionReport {
  ingredients: IngredientProvenance[];
  stepsFrom: VideoSource | null;
  /** Steps added from another source than the main one (a step only written on the video). */
  stepsAdded: number;
  /** Quality of each source's steps (stepsQuality). */
  stepScores: Partial<Record<VideoSource, number>>;
  /** 'ingredients': no source names the dish, the title is made of its main ingredients. */
  titleFrom: VideoSource | 'ingredients' | null;
  /** Texts read on the video: kept, and set aside (interface, watermarks, unsure readings). */
  screenTexts: number;
  screenChrome: number;
}

export interface FusedRecipe {
  draft: RecipeDraft;
  report: FusionReport;
  /** The texts followed on the video (for the model and the import log). */
  screen: ScreenText[];
  /** What was said, one sentence per line (kept in the notes when nothing else is usable). */
  spokenText: string;
}

const notHook = (s: { text: string }) => !isHookSentence(s.text);

/** A dish name ready to show: no emoji, no hook, a capital letter, not too long. */
function asTitle(text: string | null | undefined): string | null {
  if (!text) return null;
  let t = cleanTitle(text);
  if (!t || t.length > 60 || isHook(t) || isHookSentence(t)) return null;
  // Written in capitals on the video: put back in sentence case.
  if (t === t.toUpperCase() && /\p{L}{3}/u.test(t)) t = t.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * The recipe's name, best source first: the title written on the video, the author's title when
 * it is one, the dish named in the author's hook or text, the dish named in any text on the
 * video, the dish said in the video. "POV : tu as faim" or "La recette qui rend fou" are never a
 * title: with no dish named anywhere, the main ingredients make it ("Spaghetti & pancetta").
 */
export function pickVideoTitle(p: {
  screen: ScreenText[];
  caption: RecipeDraft;
  spoken: string;
  ingredients: DraftIngredient[];
}): { title: string | null; from: FusionReport['titleFrom'] } {
  const shown = p.screen
    .filter((t) => t.kind === 'title')
    .sort((a, b) => b.weight * b.frames - a.weight * a.frames)[0];
  // Written as a title: kept whole ("GARLIC BUTTER SHRIMP" → "Garlic butter shrimp"), else the
  // dish named in it.
  const whole = shown && shown.text.split(/\s+/).length <= 6 ? asTitle(shown.text) : null;
  const fromShown = shown && (whole ?? asTitle(dishPhrase(shown.text)));
  if (fromShown) return { title: fromShown, from: 'screen' };
  const own = asTitle(p.caption.title);
  if (own) return { title: own, from: 'caption' };
  const opening = [
    p.caption.title,
    p.caption.description,
    p.caption.notes?.split('\n').slice(0, 3).join(' '),
  ]
    .filter(Boolean)
    .join('. ');
  const inCaption = asTitle(dishPhrase(opening));
  if (inCaption) return { title: inCaption, from: 'caption' };
  // Only texts that are neither an ingredient nor a step ("2 c. à soupe de curry" is no soup).
  for (const t of p.screen.filter(
    (x) => (x.kind === 'title' || x.kind === 'other') && x.text.split(/\s+/).length <= 8,
  )) {
    const d = asTitle(dishPhrase(t.text));
    if (d) return { title: d, from: 'screen' };
  }
  const said = asTitle(dishPhrase(p.spoken.slice(0, 400)));
  if (said) return { title: said, from: 'speech' };
  const main = p.ingredients
    .map((i) => cleanTitle(i.name))
    .filter((n) => n && n.length <= 30)
    .slice(0, 2);
  if (main.length) {
    const t = main.join(' & ');
    return { title: t.charAt(0).toUpperCase() + t.slice(1), from: 'ingredients' };
  }
  return { title: asTitle(p.caption.title) ?? null, from: null };
}

/** Fewer ingredients than this from the post and the screen: the ones said are added too. */
const FEW_INGREDIENTS = 3;

export function fuseVideoRecipe(ev: VideoEvidence): FusedRecipe {
  const screen = trackScreenText(ev.screen);
  // Each phrase said ends where the speaker paused: a hook said first ("je vais vous montrer…")
  // is never glued to the first step.
  const phrases = ev.speech.map((s) => {
    const t = s.text.trim();
    return /[.!?…]$/.test(t) || !t ? t : `${t}.`;
  });
  const spoken = recipeFromTranscript(phrases);
  const cands: IngredientCandidate[] = [];
  ev.caption.ingredients.forEach((ing, order) =>
    cands.push({ ing, source: 'caption', weight: 1, order }),
  );
  screen
    .filter((t) => t.kind === 'ingredient')
    .forEach((t, order) => {
      const ing = screenIngredient(t.text);
      if (ing) cands.push({ ing, source: 'screen', weight: t.weight, order });
    });
  const written = new Set(cands.map((c) => ingredientKey(c.ing.name))).size;
  // Phrase by phrase: "ce poulet au curry… il faut 500 grammes de poulet" names the food twice,
  // and only the second time with its quantity.
  const heard = ev.speech.flatMap((seg) => recipeFromTranscript([seg.text]).ingredients);
  (heard.length ? heard : spoken.ingredients).forEach((ing, order) => {
    const known = cands.some((c) => sameIngredient(c.ing.name, ing.name));
    // What is said confirms a quantity; a food only said is added when little is written
    // ("et un peu de sel" in passing is not always an ingredient of the list).
    if (known || written < FEW_INGREDIENTS)
      cands.push({ ing, source: 'speech', weight: 0.7, order });
  });
  const { ingredients, provenance } = fuseIngredients(cands);

  // Steps: each source's list as a whole, the best one kept, completed by the steps only written
  // on the video.
  const sets: Partial<Record<Exclude<VideoSource, 'model'>, { s: DraftStep; t: number }[]>> = {
    caption: ev.caption.steps.filter(notHook).map((s, i) => ({ s, t: i })),
    screen: screen
      .filter((t) => t.kind === 'step' && !isHookSentence(t.text))
      .map((t) => ({ s: step(t.text), t: t.first })),
    speech: spoken.steps
      .filter(notHook)
      .map((s) => ({ s: step(s.text), t: timeOfSpoken(s.text, ev.speech) }))
      .sort((a, b) => a.t - b.t),
  };
  const stepScores: Partial<Record<VideoSource, number>> = {};
  let stepsFrom: Exclude<VideoSource, 'model'> | null = null;
  for (const k of ['caption', 'screen', 'speech'] as const) {
    const list = sets[k]!;
    // The author's own steps, when they are a method, come first: a little bonus.
    const bonus = k === 'caption' ? 1.25 : 1;
    stepScores[k] =
      stepsQuality(
        list.map((x) => x.s),
        ingredients,
      ) * bonus;
    if (stepScores[k]! > 0 && (!stepsFrom || stepScores[k]! > stepScores[stepsFrom]!))
      stepsFrom = k;
  }
  let chosen = stepsFrom ? [...sets[stepsFrom]!] : [];
  let stepsAdded = 0;
  if (stepsFrom && stepsFrom !== 'caption')
    for (const other of ['screen', 'speech'] as const) {
      if (other === stepsFrom) continue;
      for (const x of sets[other]!) {
        if (!isCookingStep(x.s.text) || chosen.some((c) => similarStep(c.s.text, x.s.text)))
          continue;
        // Placed by time (both lists come from the video's timeline).
        if (!Number.isFinite(x.t)) continue;
        const at = chosen.findIndex((c) => c.t > x.t);
        chosen.splice(at < 0 ? chosen.length : at, 0, x);
        stepsAdded++;
      }
    }
  chosen = chosen.slice(0, 40);

  const { title, from: titleFrom } = pickVideoTitle({
    screen,
    caption: ev.caption,
    spoken: spoken.text,
    ingredients,
  });

  return {
    draft: { ...ev.caption, title, ingredients, steps: chosen.map((x) => x.s) },
    report: {
      ingredients: provenance,
      stepsFrom,
      stepsAdded,
      stepScores,
      titleFrom,
      screenTexts: screen.filter((t) => t.kind !== 'chrome').length,
      screenChrome: screen.filter((t) => t.kind === 'chrome').length,
    },
    screen,
    spokenText: spoken.text,
  };
}

// ---------------------------------------------------------------------------------------------
// The on-device language model: what to give it, and how its answer is checked.

/** Room given to the evidence in the model's prompt (its context is about 4 000 tokens). */
const PROMPT_BUDGET = 9000;

/**
 * The evidence for the model, shortest form first: the post, the texts written on the video
 * (each once, with its time), what is said (with times). Cut to fit the model's context.
 */
export function modelPrompt(ev: VideoEvidence, fused: FusedRecipe): string {
  const c = ev.caption;
  const post = [
    c.title ? `Titre : ${c.title}` : null,
    c.description,
    c.ingredients.length
      ? `Ingrédients :\n${c.ingredients.map((i) => `- ${[i.quantity, i.unit, i.name].filter((x) => x !== null && x !== '').join(' ')}`).join('\n')}`
      : null,
    c.steps.length ? `Étapes :\n${c.steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n')}` : null,
    c.notes,
  ]
    .filter(Boolean)
    .join('\n');
  const written = fused.screen
    .filter((t) => t.kind !== 'chrome')
    .map((t) => `[${Math.round(t.first)}s] ${t.text}`)
    .join('\n');
  const said = ev.speech.map((s) => `[${Math.round(s.start)}s] ${s.text}`).join('\n');
  const parts = [
    ['TEXTE DE LA PUBLICATION', post],
    ['TEXTE ÉCRIT SUR LA VIDÉO', written],
    ['CE QUI EST DIT DANS LA VIDÉO', said],
  ].filter(([, v]) => v);
  // Each part gets its share of the budget; what a short part leaves goes to the others.
  let left = PROMPT_BUDGET;
  let n = parts.length;
  return parts
    .map(([head, body]) => [head, body] as const)
    .sort((a, b) => a[1]!.length - b[1]!.length)
    .map(([head, body]) => {
      const share = Math.floor(left / n--);
      const cut = body!.length > share ? `${body!.slice(0, share)}…` : body!;
      left -= cut.length;
      return { head, cut };
    })
    .sort(
      (a, b) => parts.findIndex((p) => p[0] === a.head) - parts.findIndex((p) => p[0] === b.head),
    )
    .map(({ head, cut }) => `### ${head}\n${cut}`)
    .join('\n\n');
}

/** What the model answers (its guided output). */
export interface ModelRecipe {
  title: string | null;
  servings: number | null;
  ingredients: { name: string; quantity: string | null; unit: string | null }[];
  steps: string[];
}

function numbersIn(text: string): Set<number> {
  const out = new Set<number>();
  const n = normalizeText(text);
  for (const m of n.matchAll(/(\d+)(?:[.,](\d+))?(?:\s*\/\s*(\d+))?/g)) {
    const whole = Number(m[1]);
    if (m[3]) out.add(whole / Number(m[3]));
    else out.add(m[2] ? Number(`${m[1]}.${m[2]}`) : whole);
  }
  for (const [frac, v] of [
    ['½', 0.5],
    ['¼', 0.25],
    ['¾', 0.75],
    ['⅓', 1 / 3],
    ['⅔', 2 / 3],
  ] as const)
    if (text.includes(frac)) out.add(v);
  for (const w of tokenize(text)) if (w in SPOKEN_NUMBERS) out.add(SPOKEN_NUMBERS[w]!);
  return out;
}

export interface GroundedModelRecipe {
  title: string | null;
  servings: number | null;
  ingredients: DraftIngredient[];
  steps: DraftStep[];
  /** What the model wrote that none of the sources says (dropped). */
  dropped: string[];
}

/**
 * Keeps of the model's answer only what the sources say: an ingredient named in the post, on
 * the video or in what is said; a quantity that appears in them; a step whose words are there.
 * A language model can invent a plausible "1 c. à café de sel" or a step it expects: never kept.
 */
export function groundModelRecipe(
  m: ModelRecipe,
  ev: VideoEvidence,
  fused: FusedRecipe,
): GroundedModelRecipe {
  const corpus = [
    ev.caption.title,
    ev.caption.description,
    ev.caption.notes,
    ...ev.caption.ingredients.map((i) => `${i.quantity ?? ''} ${i.unit ?? ''} ${i.name}`),
    ...ev.caption.steps.map((s) => s.text),
    ...fused.screen.filter((t) => t.kind !== 'chrome').map((t) => t.text),
    ...ev.speech.map((s) => s.text),
  ]
    .filter(Boolean)
    .join('\n');
  const words = new Set(contentWords(corpus));
  const vocab = [...words];
  const known = (w: string) =>
    words.has(w) ||
    (w.length >= 5 &&
      vocab.some((v) => Math.abs(v.length - w.length) <= 1 && levenshtein(v, w) <= 1));
  const share = (text: string) => {
    const ws = contentWords(text);
    return ws.length ? ws.filter(known).length / ws.length : 0;
  };
  const numbers = numbersIn(corpus);
  const dropped: string[] = [];
  const ingredients: DraftIngredient[] = [];
  for (const i of m.ingredients.slice(0, 60)) {
    const name = i.name?.trim();
    if (!name) continue;
    if (share(name) < 0.6) {
      dropped.push(name);
      continue;
    }
    const parsed = parseIngredientLine([i.quantity, i.unit, name].filter(Boolean).join(' '));
    let quantity = parsed?.quantity ?? null;
    let quantityMax = parsed?.quantityMax ?? null;
    let unit = parsed?.unit ?? (i.unit?.trim() || null);
    // A quantity nobody said or wrote is a guess: the ingredient stays, without it.
    if (quantity !== null && !numbers.has(quantity)) {
      dropped.push(`${i.quantity ?? ''} ${i.unit ?? ''} ${name}`.trim());
      quantity = null;
      quantityMax = null;
      unit = null;
    }
    ingredients.push({
      group: null,
      name: parsed?.name || name,
      quantity,
      quantityMax,
      unit,
      note: parsed?.note ?? null,
    });
  }
  const steps: DraftStep[] = [];
  for (const s of m.steps.slice(0, 40)) {
    const text = s?.trim();
    if (!text) continue;
    if (share(text) < 0.6 || isHookSentence(text)) dropped.push(text);
    else steps.push(step(text));
  }
  const title = m.title && share(m.title) >= 0.5 ? asTitle(m.title) : null;
  const servings =
    m.servings && Number.isInteger(m.servings) && numbers.has(m.servings) && m.servings <= 50
      ? m.servings
      : null;
  return { title, servings, ingredients, steps, dropped };
}

/**
 * The model's checked version against the fused one, field by field: its steps when clearly
 * better, its ingredients when it found about as many (they come with clean names), with the
 * quantities the sources agree on filled in. Returns the final draft and what came from it.
 */
export function chooseVideoRecipe(
  fused: FusedRecipe,
  model: GroundedModelRecipe | null,
): { draft: RecipeDraft; fromModel: ('title' | 'ingredients' | 'steps' | 'servings')[] } {
  const draft: RecipeDraft = { ...fused.draft };
  const fromModel: ('title' | 'ingredients' | 'steps' | 'servings')[] = [];
  if (!model) return { draft, fromModel };
  const base = fused.draft;
  if (
    model.ingredients.length >= Math.max(1, Math.ceil(base.ingredients.length * 0.8)) &&
    model.ingredients.length >= base.ingredients.length - 1
  ) {
    // Same food on both sides: the quantity the sources agreed on beats the model's reading.
    draft.ingredients = model.ingredients.map((mi) => {
      const f = base.ingredients.find((b) => sameIngredient(b.name, mi.name));
      return f && f.quantity !== null
        ? { ...mi, quantity: f.quantity, quantityMax: f.quantityMax, unit: f.unit }
        : mi;
    });
    // Foods the sources have and the model left out are kept.
    for (const b of base.ingredients)
      if (!draft.ingredients.some((d) => sameIngredient(d.name, b.name))) draft.ingredients.push(b);
    fromModel.push('ingredients');
  }
  const mine = stepsQuality(base.steps, draft.ingredients);
  const theirs = stepsQuality(model.steps, draft.ingredients);
  // A model rephrases well: it must be clearly better to replace the author's or the video's.
  if (theirs > mine * 1.15) {
    draft.steps = model.steps;
    fromModel.push('steps');
  }
  // The model names the dish when no source did (the title is then only its main ingredients).
  // …or a more precise name of the same dish ("Pâtes" said, "Pâtes carbonara" from the model).
  const sameDish =
    !!base.title &&
    !!model.title &&
    base.title.split(/\s+/).length === 1 &&
    model.title.length > base.title.length &&
    normalizeText(model.title).includes(normalizeText(base.title));
  if (
    model.title &&
    (!base.title || isHook(base.title) || fused.report.titleFrom === 'ingredients' || sameDish)
  ) {
    draft.title = model.title;
    fromModel.push('title');
  }
  if (model.servings && !base.servings) {
    draft.servings = model.servings;
    fromModel.push('servings');
  }
  return { draft, fromModel };
}

/** One line for the import log: where each part of the recipe came from. */
export function fusionSummary(f: FusedRecipe, fromModel: string[] = []): string {
  const r = f.report;
  const by = (s: VideoSource) => r.ingredients.filter((i) => i.source === s).length;
  const confirmed = r.ingredients.filter((i) => i.confirmedBy.length).length;
  const conflicts = r.ingredients.filter((i) => i.conflict).length;
  return (
    `fusion: ingr ${by('caption')} post/${by('screen')} screen/${by('speech')} speech` +
    ` (${confirmed} confirmed, ${conflicts} conflicts), steps from ${r.stepsFrom ?? 'none'}` +
    `${r.stepsAdded ? ` +${r.stepsAdded}` : ''}, title from ${r.titleFrom ?? 'none'}` +
    `, screen ${r.screenTexts} texts/${r.screenChrome} ui` +
    (fromModel.length ? `, model: ${fromModel.join('+')}` : '')
  );
}

/**
 * Whether a recipe read from a post is complete enough to skip listening to its video: several
 * ingredients, most with their quantity, and a method of at least two real instructions. A
 * list without quantities or "Mélangez tout et régalez-vous !" is not: the video is listened to.
 */
export function recipeLooksComplete(d: {
  ingredients: DraftIngredient[];
  steps: { text: string }[];
}): boolean {
  const withQty = d.ingredients.filter((i) => i.quantity !== null).length;
  const cooking = d.steps.filter((s) => isCookingStep(s.text)).length;
  return d.ingredients.length >= 2 && withQty >= d.ingredients.length * 0.6 && cooking >= 2;
}
