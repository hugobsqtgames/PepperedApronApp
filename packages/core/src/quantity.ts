import type { Locale, UnitSystem } from './enums';
import { getUnit, type UnitDef } from './units';

export interface Quantity {
  value: number;
  /** Upper bound for ranges such as "2-3 eggs". */
  max: number | null;
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};
const UF = Object.keys(UNICODE_FRACTIONS).join('');

/** One number: "1", "1.5", "1,5", "1/2", "1 1/2", "½", "1½", "1 ½". */
export const NUMBER_PATTERN = `(?:\\d+(?:[.,]\\d+)?\\s*[${UF}]|\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d+(?:[.,]\\d+)?|[${UF}])`;
/** A quantity with an optional range: "2-3", "2 à 3", "2 to 3", "2–3". */
export const QUANTITY_PATTERN = `${NUMBER_PATTERN}(?:\\s*(?:-|–|—|à|a|to|bis|o|al)\\s*${NUMBER_PATTERN})?`;

export function parseNumber(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (s in UNICODE_FRACTIONS) return UNICODE_FRACTIONS[s]!;
  let m = s.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*([${UF}])$`));
  if (m) return parseFloat(m[1]!.replace(',', '.')) + UNICODE_FRACTIONS[m[2]!]!;
  m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (m) {
    const d = Number(m[3]);
    return d === 0 ? null : Number(m[1]) + Number(m[2]) / d;
  }
  m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) {
    const d = Number(m[2]);
    return d === 0 ? null : Number(m[1]) / d;
  }
  m = s.match(/^\d+(?:[.,]\d+)?$/);
  if (m) return parseFloat(s.replace(',', '.'));
  return null;
}

export function parseQuantity(raw: string): Quantity | null {
  const m = raw
    .trim()
    .match(
      new RegExp(
        `^(${NUMBER_PATTERN})(?:\\s*(?:-|–|—|à|a|to|bis|o|al)\\s*(${NUMBER_PATTERN}))?$`,
        'i',
      ),
    );
  if (!m) return null;
  const value = parseNumber(m[1]!);
  if (value === null || !(value > 0)) return null;
  const max = m[2] ? parseNumber(m[2]) : null;
  return { value, max: max !== null && max > value ? max : null };
}

const NICE_FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [1 / 2, '½'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [7 / 8, '⅞'],
];

function numberFormat(locale: Locale, maxDigits: number): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxDigits, useGrouping: false });
}

/** Round a metric quantity to a sensible kitchen precision. */
export function roundKitchen(v: number): number {
  if (v >= 250) return Math.round(v / 5) * 5;
  if (v >= 20) return Math.round(v);
  if (v >= 1) return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

/** Format a single number; fraction-friendly units render as "1 ½". */
export function formatNumber(v: number, locale: Locale, fractions: boolean): string {
  if (fractions) {
    const whole = Math.floor(v + 1e-9);
    const frac = v - whole;
    if (frac < 0.06)
      return numberFormat(locale, 0).format(whole === 0 ? Math.max(v, 0) : whole) || '0';
    if (frac > 0.94) return numberFormat(locale, 0).format(whole + 1);
    let best: [number, string] = NICE_FRACTIONS[0]!;
    for (const f of NICE_FRACTIONS) if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f;
    if (Math.abs(best[0] - frac) <= 0.05) return whole > 0 ? `${whole} ${best[1]}` : best[1];
    return numberFormat(locale, 1).format(v);
  }
  return numberFormat(locale, 2).format(roundKitchen(v));
}

export interface AmountLike {
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
}

export function scaleAmount<T extends AmountLike>(a: T, factor: number): T {
  if (!(factor > 0) || !Number.isFinite(factor)) return a;
  return {
    ...a,
    quantity: a.quantity === null ? null : a.quantity * factor,
    quantityMax: a.quantityMax === null ? null : a.quantityMax * factor,
  };
}

export function scaleFactor(fromServings: number | null | undefined, toServings: number): number {
  if (!fromServings || fromServings <= 0 || toServings <= 0) return 1;
  return toServings / fromServings;
}

/** Pick the most readable unit in the same system (1500 g → 1.5 kg, 0.25 l → 25 cl). */
export function normalizeAmount<T extends AmountLike>(a: T): T {
  const u = getUnit(a.unit);
  if (!u || a.quantity === null || u.dimension === 'count') return a;
  const base = a.quantity * u.toBase;
  const baseMax = a.quantityMax === null ? null : a.quantityMax * u.toBase;
  const pick = (key: string): T => {
    const t = getUnit(key)!;
    return {
      ...a,
      unit: key,
      quantity: base / t.toBase,
      quantityMax: baseMax === null ? null : baseMax / t.toBase,
    };
  };
  if (u.system === 'metric') {
    if (u.dimension === 'mass')
      return base >= 1000 ? pick('kg') : base < 1 ? pick('mg') : pick('g');
    if (base >= 1000) return pick('l');
    if (u.key === 'l' || u.key === 'cl' || u.key === 'dl')
      return base % 10 === 0 ? pick('cl') : pick('ml');
    return pick('ml');
  }
  if (u.key === 'oz' && base >= 453.592) return pick('lb');
  if (u.key === 'lb' && base < 453.592 / 2) return pick('oz');
  return a;
}

/** Convert between metric and imperial display systems. Spoons and counts are untouched. */
export function convertAmount<T extends AmountLike>(a: T, target: UnitSystem): T {
  const u = getUnit(a.unit);
  if (!u || a.quantity === null || u.system === 'any' || u.system === target) return a;
  const base = a.quantity * u.toBase;
  const baseMax = a.quantityMax === null ? null : a.quantityMax * u.toBase;
  const to = (t: UnitDef): T => ({
    ...a,
    unit: t.key,
    quantity: base / t.toBase,
    quantityMax: baseMax === null ? null : baseMax / t.toBase,
  });
  if (target === 'metric') {
    return normalizeAmount(to(getUnit(u.dimension === 'mass' ? 'g' : 'ml')!));
  }
  if (u.dimension === 'mass') return to(getUnit(base >= 453.592 ? 'lb' : 'oz')!);
  if (base < 15) return to(getUnit('tsp')!);
  if (base < 60) return to(getUnit('tbsp')!);
  return to(getUnit('cup')!);
}

export function formatAmount(a: AmountLike, locale: Locale): string {
  if (a.quantity === null) return '';
  const u = getUnit(a.unit);
  const fractions = u ? u.fractions : true;
  const q = formatNumber(a.quantity, locale, fractions);
  return a.quantityMax !== null ? `${q}–${formatNumber(a.quantityMax, locale, fractions)}` : q;
}
