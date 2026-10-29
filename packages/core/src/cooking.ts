import type { Locale } from './enums';
import { formatNumber, NUMBER_PATTERN, parseNumber, type AmountLike } from './quantity';
import { normalizeText, singularize, tokenize } from './text';
import { getUnit, UNITS } from './units';

// ---------------------------------------------------------------- smart scaling

const EGG = /\b(oeuf|oeufs|œuf|œufs|egg|eggs|jaune|jaunes|blanc|blancs|yolk|yolks)\b/;

/**
 * Round a scaled amount the way a cook would: whole eggs, halves of an onion, quarters of a
 * spoon. Weights and liquids are left alone (they are rounded when displayed). `changed` tells
 * when the rounding is noticeable (the display then says "≈").
 */
export function roundForCooking<T extends AmountLike>(
  a: T,
  name: string,
): T & { changed: boolean } {
  if (a.quantity === null) return { ...a, changed: false };
  const u = getUnit(a.unit);
  let step: number | null = null;
  let min = 0;
  if (!u || u.dimension === 'count') {
    if (EGG.test(normalizeText(name))) {
      step = 1;
      min = 1;
    } else step = a.quantity < 1 ? 0.25 : a.quantity < 5 ? 0.5 : 1;
  } else if (u.key === 'tsp' || u.key === 'tbsp' || u.key === 'cup') {
    step = 0.25;
    min = 0.125;
  }
  if (step === null) return { ...a, changed: false };
  const round = (v: number) => Math.max(min || step!, Math.round(v / step!) * step!);
  const q = round(a.quantity);
  const max = a.quantityMax === null ? null : round(a.quantityMax);
  return {
    ...a,
    quantity: q,
    quantityMax: max !== null && max > q ? max : null,
    changed: Math.abs(q - a.quantity) / a.quantity > 0.1,
  };
}

// ---------------------------------------------------------------- baking tins

export type MoldSize =
  { shape: 'round'; diameter: number } | { shape: 'rect'; width: number; length: number };

const MOLD_WORDS =
  '(?:moule|cercle|tourtiere|plat|cadre|ramequin|caisse|tin|pan|springform|dish|skillet|poele)';
const CM = '(?:cm|centimetres?|centimeters?)';
const INCH = '(?:"|”|in\\b|inch(?:es)?|pouces?)';

/** The baking tin mentioned in a recipe ("moule de 24 cm", "plat 20 x 30 cm", "9-inch pan"). */
export function findMoldSize(texts: (string | null | undefined)[]): MoldSize | null {
  for (const raw of texts) {
    if (!raw) continue;
    const t = normalizeText(raw);
    let m = t.match(
      new RegExp(
        `${MOLD_WORDS}[^.\\n]{0,40}?(\\d{1,2})\\s*(?:x|×|\\*|sur|by)\\s*(\\d{1,2})\\s*${CM}`,
      ),
    );
    if (m) return { shape: 'rect', width: Number(m[1]), length: Number(m[2]) };
    m = t.match(
      new RegExp(
        `(\\d{1,2})\\s*(?:x|×|\\*|by)\\s*(\\d{1,2})[- ]?${INCH}?[^.\\n]{0,12}${MOLD_WORDS}`,
      ),
    );
    if (m && /in|"|”|pouce/.test(m[0]))
      return {
        shape: 'rect',
        width: Math.round(Number(m[1]) * 2.54),
        length: Math.round(Number(m[2]) * 2.54),
      };
    m = t.match(
      new RegExp(`${MOLD_WORDS}[^.\\n]{0,40}?(?:Ø|diametre\\s*(?:de\\s*)?)?(\\d{1,2})\\s*${CM}`),
    );
    if (m && Number(m[1]) >= 8) return { shape: 'round', diameter: Number(m[1]) };
    m = t.match(new RegExp(`(\\d{1,2})\\s*${CM}\\s*de\\s*diametre`));
    if (m && Number(m[1]) >= 8) return { shape: 'round', diameter: Number(m[1]) };
    m = t.match(new RegExp(`(\\d{1,2})[- ]?${INCH}[^.\\n]{0,20}?${MOLD_WORDS}`));
    if (m && Number(m[1]) >= 4)
      return { shape: 'round', diameter: Math.round(Number(m[1]) * 2.54) };
  }
  return null;
}

const ROUND_TINS = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34];

/**
 * The tin to use for a scaled recipe: the area follows the quantities, so each side grows with
 * the square root of the factor (same height, same baking). Null when the same tin fits.
 */
export function scaleMold(m: MoldSize, factor: number): MoldSize | null {
  if (!(factor > 0) || Math.abs(factor - 1) < 0.05) return null;
  const k = Math.sqrt(factor);
  if (m.shape === 'round') {
    const ideal = m.diameter * k;
    const d = ROUND_TINS.reduce((a, b) => (Math.abs(b - ideal) < Math.abs(a - ideal) ? b : a));
    return d === m.diameter ? null : { shape: 'round', diameter: d };
  }
  const width = Math.round(m.width * k);
  const length = Math.round(m.length * k);
  return width === m.width && length === m.length ? null : { shape: 'rect', width, length };
}

// ---------------------------------------------------------------- quantities in step text

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Weight and volume units as typed in a sentence ("200 g", "2 c. à soupe", "1 cup"). */
const UNIT_WORDS = UNITS.filter((u) => u.dimension !== 'count')
  .flatMap((u) => u.aliases.map((a) => ({ alias: normalizeText(a), unit: u })))
  // German "EL"/"TL" are also ordinary words elsewhere.
  .filter((a) => a.alias !== 'el' && a.alias !== 'tl')
  .sort((a, b) => b.alias.length - a.alias.length);
const UNIT_BY_ALIAS = new Map(UNIT_WORDS.map((a) => [a.alias, a.unit]));
const STEP_QTY = new RegExp(
  `(?<![\\p{L}\\d.,/])(${NUMBER_PATTERN})(?:(\\s*(?:-|–|à|a|to)\\s*)(${NUMBER_PATTERN}))?(\\s*)(${UNIT_WORDS.map((a) => escape(a.alias)).join('|')})(?![\\p{L}])`,
  'gu',
);

/** Lowercase and accents removed, one character for one character (indexes stay valid). */
function foldSameLength(s: string): string {
  let out = '';
  for (const ch of s) {
    const d = ch.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += d.length === ch.length ? d : ch.length === 1 ? (d[0] ?? ' ') : ch;
  }
  return out;
}

/**
 * Scale the weights and volumes written inside a step ("ajoutez 200 g de farine" → "300 g" for
 * 1.5×). Times, temperatures and sizes are never changed.
 */
export function scaleStepText(text: string, factor: number, locale: Locale): string {
  if (!(factor > 0) || factor === 1) return text;
  const folded = foldSameLength(text);
  if (folded.length !== text.length) return text;
  let out = '';
  let last = 0;
  for (const m of folded.matchAll(STEP_QTY)) {
    const unit = UNIT_BY_ALIAS.get(m[5]!);
    const a = parseNumber(m[1]!);
    if (!unit || a === null) continue;
    const b = m[3] ? parseNumber(m[3]) : null;
    const fmt = (v: number) => formatNumber(v * factor, locale, unit.fractions);
    const start = m.index!;
    const numbers =
      b !== null ? `${fmt(a)}${text.substr(start + m[1]!.length, m[2]!.length)}${fmt(b)}` : fmt(a);
    const numbersLength = m[1]!.length + (m[2]?.length ?? 0) + (m[3]?.length ?? 0);
    out += text.slice(last, start) + numbers;
    last = start + numbersLength;
  }
  return out + text.slice(last);
}

// ---------------------------------------------------------------- converter

/** Units offered by the kitchen converter, by dimension. */
export const CONVERTER_UNITS = {
  mass: ['g', 'kg', 'oz', 'lb'],
  volume: ['ml', 'cl', 'dl', 'l', 'tsp', 'tbsp', 'cup', 'floz'],
} as const;
export type ConverterUnit =
  (typeof CONVERTER_UNITS)['mass'][number] | (typeof CONVERTER_UNITS)['volume'][number];

/** Grams per millilitre of common ingredients, to turn cups and spoons into grams. */
export const DENSITIES = [
  { key: 'flour', gPerMl: 0.53, words: ['farine', 'flour', 'maizena', 'fecule', 'cornstarch'] },
  { key: 'sugar', gPerMl: 0.85, words: ['sucre', 'sugar'] },
  { key: 'icingSugar', gPerMl: 0.5, words: ['sucre glace', 'icing sugar', 'powdered sugar'] },
  {
    key: 'brownSugar',
    gPerMl: 0.83,
    words: ['cassonade', 'sucre roux', 'vergeoise', 'brown sugar'],
  },
  { key: 'butter', gPerMl: 0.96, words: ['beurre', 'butter'] },
  { key: 'rice', gPerMl: 0.79, words: ['riz', 'rice'] },
  { key: 'oats', gPerMl: 0.38, words: ['flocon d avoine', 'avoine', 'oat'] },
  { key: 'cocoa', gPerMl: 0.42, words: ['cacao', 'cocoa'] },
  { key: 'almond', gPerMl: 0.4, words: ['poudre d amande', 'amande en poudre', 'almond flour'] },
  { key: 'honey', gPerMl: 1.42, words: ['miel', 'honey', 'sirop d erable', 'maple syrup'] },
  { key: 'milk', gPerMl: 1.03, words: ['lait', 'milk'] },
  { key: 'cream', gPerMl: 1.0, words: ['creme', 'cream'] },
  { key: 'oil', gPerMl: 0.92, words: ['huile', 'oil'] },
  { key: 'water', gPerMl: 1.0, words: ['eau', 'water'] },
  { key: 'salt', gPerMl: 1.2, words: ['sel', 'salt'] },
] as const;
export type DensityKey = (typeof DENSITIES)[number]['key'];

const DENSITY_TOKENS = DENSITIES.flatMap((d) =>
  d.words.map((w) => ({ key: d.key, gPerMl: d.gPerMl, tokens: tokenize(w).map(singularize) })),
).sort((a, b) => b.tokens.length - a.tokens.length);

/** Density of an ingredient from its name ("farine T55" → flour), or null. */
export function densityOf(name: string): { key: DensityKey; gPerMl: number } | null {
  const toks = tokenize(name).map(singularize);
  for (const d of DENSITY_TOKENS) {
    for (let i = 0; i + d.tokens.length <= toks.length; i++) {
      let ok = true;
      for (let j = 0; j < d.tokens.length && ok; j++) ok = toks[i + j] === d.tokens[j];
      if (ok) return { key: d.key, gPerMl: d.gPerMl };
    }
  }
  return null;
}

/**
 * Convert a kitchen quantity. Between weight and volume a density is needed (g per ml of the
 * ingredient); without it the conversion is impossible (null).
 */
export function convertUnits(
  value: number,
  from: ConverterUnit,
  to: ConverterUnit,
  gPerMl: number | null = null,
): number | null {
  const a = getUnit(from);
  const b = getUnit(to);
  if (!a || !b || !Number.isFinite(value)) return null;
  let base = value * a.toBase;
  if (a.dimension !== b.dimension) {
    if (!gPerMl) return null;
    base = a.dimension === 'volume' ? base * gPerMl : base / gPerMl;
  }
  return base / b.toBase;
}

/** US recipes measure flour or sugar in cups: in metric, show grams when the density is known. */
export function cupsToGrams<T extends AmountLike>(a: T, name: string): T {
  const u = getUnit(a.unit);
  if (!u || a.quantity === null || u.dimension !== 'volume' || u.system !== 'imperial') return a;
  const d = densityOf(name);
  if (!d || d.key === 'water' || d.key === 'milk' || d.key === 'cream' || d.key === 'oil') return a;
  const g = (v: number) => v * u.toBase * d.gPerMl;
  return {
    ...a,
    unit: 'g',
    quantity: g(a.quantity),
    quantityMax: a.quantityMax === null ? null : g(a.quantityMax),
  };
}
