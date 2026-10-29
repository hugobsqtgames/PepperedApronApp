import { parseTimerSeconds } from '../duration';
import { foodSpans } from '../shopping';
import { ingredientKey, normalizeText, singularize } from '../text';
import type { DraftIngredient, DraftStep } from './draft';
import { parseIngredientLine } from './ingredient';

/**
 * Recipes explained only out loud: reads the video's automatic subtitles (published by TikTok or
 * YouTube) with fixed rules — no AI. Ingredients are the foods mentioned (with a quantity when
 * one is said just before), steps are the sentences describing a cooking action. The whole
 * transcript is kept so the user can complete the recipe.
 */

/** Plain text of a WebVTT file: cue text only, tags removed, rolling duplicates merged. */
export function vttToLines(vtt: string): string[] {
  const out: string[] = [];
  for (const block of vtt.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0] ?? '')) continue;
    for (const l of lines) {
      if (!l.trim() || l.includes('-->') || /^\d+$/.test(l.trim())) continue;
      const text = l
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\[[^\]]*\]/g, '')
        .trim();
      if (!text) continue;
      // Auto captions repeat the previous line while the next one is typed.
      const prev = out[out.length - 1];
      if (prev === text) continue;
      if (prev && text.startsWith(prev)) out[out.length - 1] = text;
      else if (prev && prev.endsWith(text)) continue;
      else out.push(text);
    }
  }
  return out;
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  douze: 12,
  quinze: 15,
  vingt: 20,
  trente: 30,
  cinquante: 50,
  cent: 100,
  demi: 0.5,
  demie: 0.5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  ten: 10,
  half: 0.5,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  medio: 0.5,
  media: 0.5,
  ein: 1,
  eine: 1,
  einen: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  funf: 5,
  halbe: 0.5,
  halben: 0.5,
  due: 2,
  tre: 3,
  quattro: 4,
  mezzo: 0.5,
  mezza: 0.5,
};
// Words that are foods only after certain words ("du maïs" vs "mais" = but).
const AMBIGUOUS: Record<string, string[]> = {
  mais: ['du', 'de', 'grain', 'grains', 'epi', 'epis'],
  glace: ['de', 'une', 'boule', 'boules', 'la'],
  glaces: ['de', 'boules'],
  sel: ['du', 'de', 'le', 'fleur', 'pincee', 'gros'],
  orange: ['une', 'des', 'd', 'de', 'l', 'jus', 'zeste', 'an'],
  cote: ['une', 'des', 'deux', 'trois'],
  roti: ['un', 'le', 'du'],
};
// "un pesto", "une poêle" (often written "1" by speech recognition): articles, a quantity only before a measure.
const ONE = new Set(['1', 'un', 'une', 'one', 'uno', 'una', 'ein', 'eine', 'einen']);
// Small words allowed between a quantity and the food ("2 cuillères à soupe DE sucre").
const LINKS = new Set(
  'de d du des la le l les of the di del della dei degli von vom der die das en a al'.split(' '),
);

const COOKING_VERBS = [
  // fr
  'ajout',
  'rajout',
  'mélang',
  'melang',
  'cuire',
  'cuis',
  'cuit',
  'caramelis',
  'vers',
  'coup',
  'emin',
  'hach',
  'revenir',
  'enfourn',
  'prechauff',
  'mix',
  'fouett',
  'incorpor',
  'egoutt',
  'laiss',
  'mets',
  'mettez',
  'mettre',
  'saupoudr',
  'assaisonn',
  'poivr',
  'deglac',
  'dore',
  'dorer',
  'fri',
  'bouill',
  'mijot',
  'rotir',
  'epluch',
  'rap',
  'faites',
  'fais',
  'plong',
  'servez',
  'sers',
  'dress',
  'reserv',
  'retir',
  'chauff',
  'remu',
  'termin',
  'recouvr',
  'garn',
  // en
  'add',
  'mix',
  'stir',
  'cook',
  'bake',
  'boil',
  'chop',
  'slice',
  'whisk',
  'fry',
  'season',
  'simmer',
  'heat',
  'preheat',
  'combine',
  'serve',
  'melt',
  'drain',
  'blend',
  'roast',
  'grate',
  'sprinkle',
  'toss',
  'spread',
  'put',
  // es
  'anad',
  'mezcl',
  'cocin',
  'hornea',
  'cort',
  'vierte',
  'batir',
  'bate',
  'freir',
  'fri',
  'sazon',
  'calient',
  'herv',
  'remuev',
  // de
  'hinzu',
  'misch',
  'ruhr',
  'koch',
  'schneid',
  'brat',
  'wurz',
  'erhitz',
  'schmelz',
  // it
  'aggiung',
  'mescol',
  'cuoc',
  'cuoci',
  'inforn',
  'tagli',
  'versa',
  'sbatt',
  'friggi',
  'condi',
  'scald',
  'soffrigg',
];

interface Word {
  raw: string;
  /** Normalized ("œufs" → "oeufs"). */
  plain: string;
  /** Normalized and singular, as in the food dictionary. */
  norm: string;
}

function words(sentence: string): Word[] {
  return (sentence.match(/[\p{L}\p{N}]+(?:[.,]\d+)?/gu) ?? []).map((raw) => {
    const plain = normalizeText(raw).replace(/[^a-z0-9.,]/g, '');
    return { raw, plain, norm: singularize(plain) };
  });
}

function sentences(lines: string[]): string[] {
  const joined = lines.join(' ').replace(/\s+/g, ' ').trim();
  const punctuated = (joined.match(/[.!?]/g)?.length ?? 0) * 200 >= joined.length;
  // Auto captions without punctuation: each caption line is the best unit we have.
  const parts = punctuated ? joined.split(/(?<=[.!?…])\s+/) : lines;
  return parts.map((s) => s.trim()).filter(Boolean);
}

function isCookingSentence(s: string): boolean {
  const ws = words(s);
  // Questions and fragments ("Et je vais ajouter") are not instructions.
  if (ws.length < 3 || /\?\s*$/.test(s)) return false;
  const last = ws[ws.length - 1]!.plain;
  if (/(er|ir|re)$/.test(last) && COOKING_VERBS.some((v) => last.startsWith(v))) return false;
  // A verb stem plus a short conjugation ending ("ajout" → "ajoute", "ajoutez", "ajouté").
  return COOKING_VERBS.some((v) =>
    ws.some((w) => w.plain.startsWith(v) && w.plain.length - v.length <= (v.length <= 4 ? 2 : 4)),
  );
}

export interface TranscriptRecipe {
  ingredients: DraftIngredient[];
  steps: DraftStep[];
  /** The transcript, one sentence per line (kept in the recipe notes). */
  text: string;
}

export function recipeFromTranscript(lines: string[]): TranscriptRecipe {
  const all = sentences(lines);
  const ingredients: DraftIngredient[] = [];
  const seen = new Set<string>();
  for (const s of all) {
    const ws = words(s);
    for (const { start, end } of foodSpans(ws.map((w) => w.norm))) {
      const before = ws[start - 1]?.plain ?? '';
      // "cuillère à soupe" is a measure, "mais" is mostly "but": only foods when clearly used so.
      if (before === 'a' && /^cuill/.test(ws[start - 2]?.plain ?? '')) continue;
      const allowed = AMBIGUOUS[ws[start]!.plain];
      if (allowed && end - start === 1 && !allowed.includes(before)) continue;
      const name = ws
        .slice(start, end)
        .map((w) => w.raw)
        .join(' ');
      const key = ingredientKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      // Look back for a spoken quantity: "200 grammes de", "deux cuillères à soupe de".
      let k = start - 1;
      while (k >= 0 && LINKS.has(ws[k]!.norm)) k--;
      let q = -1;
      for (let back = k; back >= Math.max(0, k - 3); back--) {
        const w = ws[back]!.plain;
        if (/^\d+([.,]\d+)?$/.test(w) || w in NUMBER_WORDS) {
          q = back;
          break;
        }
      }
      let ing = null;
      if (q >= 0) {
        const phrase = [
          ...ws
            .slice(q, start)
            .map((w, i) =>
              i === 0 && w.plain in NUMBER_WORDS ? String(NUMBER_WORDS[w.plain]) : w.raw,
            ),
          name,
        ].join(' ');
        const parsed = parseIngredientLine(phrase);
        // Only a quantity that applies to this food ("1 poêle avec du beurre" is not 1 butter).
        if (
          parsed &&
          parsed.quantity !== null &&
          ingredientKey(parsed.name) === key &&
          !(ONE.has(ws[q]!.plain) && parsed.unit === null)
        )
          ing = parsed;
      }
      ingredients.push({
        group: null,
        name: ing?.name || name,
        quantity: ing?.quantity ?? null,
        quantityMax: ing?.quantityMax ?? null,
        unit: ing?.unit ?? null,
        note: null,
      });
    }
  }
  const steps = all.filter(isCookingSentence).map((text) => ({
    group: null,
    text: text.charAt(0).toUpperCase() + text.slice(1),
    timerSeconds: parseTimerSeconds(text),
    timerLabel: null,
  }));
  return { ingredients: ingredients.slice(0, 60), steps: steps.slice(0, 40), text: all.join('\n') };
}
