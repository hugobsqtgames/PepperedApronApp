import { ingredientKey } from '../text';
import type { DraftIngredient } from './draft';
import { parseIngredientLine } from './ingredient';

/** "8 min", "1 h 30", "180°C": times and temperatures written on a video are not ingredients. */
const NOT_FOOD =
  /^\d+([.,]\d+)?\s*(min|mins|minutes?|h|heures?|hours?|s|sec|secondes?|seconds?|°|degr)/i;

/**
 * Text written on a recipe video, read on the device from about one frame per second: the same
 * line shows on many frames, and only lines that look like an ingredient with its quantity
 * ("200 g de farine", "2 eggs") are kept, once each, in the order they first appear.
 */
export function ingredientsFromScreenText(frames: string[][]): DraftIngredient[] {
  const out: DraftIngredient[] = [];
  const seen = new Set<string>();
  for (const frame of frames) {
    for (const raw of frame) {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (line.length < 3 || line.length > 80 || line.split(' ').length > 8) continue;
      if (/[@#]|https?:|www\./i.test(line) || NOT_FOOD.test(line)) continue;
      const p = parseIngredientLine(line);
      if (!p || p.quantity === null || !/\p{L}{2}/u.test(p.name) || p.name.length > 40) continue;
      const key = ingredientKey(p.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ group: null, ...p });
    }
  }
  return out;
}

/**
 * Ingredients found elsewhere (text on the video) added to the recipe's, without duplicates: a
 * known ingredient only gains the quantity it was missing, a new one is added at the end.
 */
export function mergeIngredients(
  base: DraftIngredient[],
  extra: DraftIngredient[],
): DraftIngredient[] {
  const out = base.map((i) => ({ ...i }));
  const byKey = new Map(out.map((i) => [ingredientKey(i.name), i]));
  for (const e of extra) {
    const key = ingredientKey(e.name);
    const known = byKey.get(key);
    if (!known) {
      out.push({ ...e });
      byKey.set(key, out[out.length - 1]!);
    } else if (known.quantity === null && e.quantity !== null) {
      known.quantity = e.quantity;
      known.quantityMax = e.quantityMax;
      known.unit = e.unit;
    }
  }
  return out;
}
