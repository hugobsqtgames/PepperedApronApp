import type { RecipeCategory } from '@pepperedapron/core';
import type { ThemeColors } from '../theme/tokens';

/**
 * Colour of a dish, taken from its photo: the recipe page and cook mode take on its hue. The
 * colour is only a hue; its lightness is chosen so that text and buttons keep WCAG AA contrast
 * (4.5:1) in light and dark mode.
 */
export type RGB = [number, number, number];

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === R
      ? ((G - B) / d + (G < B ? 6 : 0)) / 6
      : max === G
        ? ((B - R) / d + 2) / 6
        : ((R - G) / d + 4) / 6;
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

export const hex = ([r, g, b]: RGB) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
export function parseHex(h: string): RGB {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const c = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(parseHex(a)), luminance(parseHex(b))].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

/**
 * The colour that best represents a photo: vivid, mid-light pixels weigh more than greys, dark
 * backgrounds and white plates. Null for a photo without colour (black and white).
 */
export function dominantColor(pixels: RGB[]): RGB | null {
  let wr = 0;
  let wg = 0;
  let wb = 0;
  let wt = 0;
  for (const p of pixels) {
    const [, s, l] = rgbToHsl(p);
    const w = s * s * Math.max(0, 1 - Math.abs(l - 0.5) * 1.8);
    wr += p[0] * w;
    wg += p[1] * w;
    wb += p[2] * w;
    wt += w;
  }
  if (wt < 0.05 * Math.max(1, pixels.length) * 0.05) return null;
  return [Math.round(wr / wt), Math.round(wg / wt), Math.round(wb / wt)];
}

export interface Tint {
  primary: string;
  onPrimary: string;
  primarySoft: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  accentText: string;
}

/** Lightest (light mode) or darkest (dark mode) shade of the hue that meets every contrast pair. */
function shade(h: number, s: number, ok: (c: string) => boolean, from: number, to: number): string {
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const l = from + ((to - from) * i) / steps;
    const c = hex(hslToRgb(h, s, l));
    if (ok(c)) return c;
  }
  return hex(hslToRgb(h, s, to));
}

/** Theme colours in the hue of a dish, for the given base theme (light or dark). */
export function tintFor(color: RGB, base: ThemeColors, dark: boolean): Tint {
  const [h, s0] = rgbToHsl(color);
  const s = Math.min(0.75, Math.max(0.32, s0));
  const bg = base.background;
  const surface = base.surface;
  // Text in the tint must read on the background and on cards; buttons carry their own text.
  const reads = (c: string, on: string) =>
    contrast(c, bg) >= 4.5 && contrast(c, surface) >= 4.5 && contrast(c, on) >= 4.5;
  const onPrimary = dark ? '#0E1512' : '#FFFCF6';
  const primary = dark
    ? shade(h, s, (c) => reads(c, onPrimary), 0.55, 0.92)
    : shade(h, s, (c) => reads(c, onPrimary), 0.45, 0.08);
  const soft = hex(hslToRgb(h, Math.min(0.5, s), dark ? 0.17 : 0.92));
  // The accent is the same hue, warmer and brighter: used for icons and badges.
  const ah = (h + 0.02) % 1;
  const onAccent = dark ? '#140C06' : '#FFFFFF';
  const accent = dark
    ? shade(ah, Math.min(0.85, s + 0.1), (c) => contrast(c, onAccent) >= 4.5, 0.6, 0.9)
    : shade(ah, Math.min(0.85, s + 0.1), (c) => contrast(c, onAccent) >= 4.5, 0.5, 0.1);
  const accentText = dark
    ? shade(ah, s, (c) => reads(c, bg), 0.6, 0.92)
    : shade(ah, s, (c) => reads(c, '#FFFFFF'), 0.4, 0.08);
  return { primary, onPrimary, primarySoft: soft, accent, onAccent, accentSoft: soft, accentText };
}

/**
 * Colour of the photos shown for recipes without their own (assets/photos), computed once with
 * dominantColor (they never change).
 */
export const CATEGORY_TINTS: Record<RecipeCategory, RGB> = {
  breakfast: [178, 115, 42],
  appetizer: [156, 118, 57],
  starter: [194, 102, 62],
  soup: [228, 152, 17],
  salad: [176, 145, 69],
  main: [119, 91, 31],
  pasta: [172, 100, 32],
  meat: [139, 86, 40],
  fish: [154, 102, 56],
  vegetarian: [143, 112, 33],
  side: [182, 128, 39],
  sauce: [135, 65, 28],
  baking: [97, 70, 47],
  dessert: [149, 77, 64],
  snack: [206, 100, 86],
  drinks: [229, 95, 24],
};
