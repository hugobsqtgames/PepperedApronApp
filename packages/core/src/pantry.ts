import { getUnit } from './units';
import { normalizeAmount } from './quantity';
import { addDays } from './planning';
import type { ShoppingLine } from './shopping';
import { ingredientKey } from './text';
import { dietTags } from './diet';

export interface PantryLike {
  name: string;
  quantity: number | null;
  unit: string | null;
}

/** Same unit, or both in g/kg, ml/l…: the quantities can be compared. */
function comparable(a: string | null, b: string | null): number | null {
  if (a === b) return 1;
  const ua = getUnit(a);
  const ub = getUnit(b);
  if (ua && ub && ua.dimension === ub.dimension && ua.dimension !== 'count')
    return ub.toBase / ua.toBase;
  return null;
}

/**
 * What is already in the pantry is not bought again: a line is dropped when the pantry has the
 * ingredient (without a quantity, or in a unit that cannot be compared), or reduced by what the
 * pantry holds when the quantities can be compared (500 g needed, 200 g in the cupboard → 300 g).
 */
export function deductPantry<T extends ShoppingLine>(
  lines: T[],
  pantry: PantryLike[],
): { lines: T[]; skipped: string[] } {
  const stock = new Map<string, PantryLike[]>();
  for (const p of pantry) {
    const k = ingredientKey(p.name);
    if (k) stock.set(k, [...(stock.get(k) ?? []), p]);
  }
  const out: T[] = [];
  const skipped: string[] = [];
  for (const l of lines) {
    const have = stock.get(ingredientKey(l.name));
    if (!have) {
      out.push(l);
      continue;
    }
    if (l.quantity === null || have.some((p) => p.quantity === null)) {
      skipped.push(l.name);
      continue;
    }
    let left = l.quantity;
    let measurable = false;
    for (const p of have) {
      const k = comparable(l.unit, p.unit);
      if (k === null) continue;
      measurable = true;
      left -= p.quantity! * k;
    }
    if (!measurable || left <= l.quantity * 0.05) {
      skipped.push(l.name);
      continue;
    }
    const n = normalizeAmount({ quantity: left, quantityMax: null, unit: l.unit });
    out.push({ ...l, quantity: Math.round(n.quantity! * 100) / 100, unit: n.unit });
  }
  return { lines: out, skipped };
}

/** Items to use soon: expiring by `days` from today (expired ones included), soonest first. */
export function expiringSoon<T extends { expiresOn: string | null }>(
  items: T[],
  today: string,
  days = 3,
): T[] {
  const limit = addDays(today, days);
  return items
    .filter((i) => i.expiresOn !== null && i.expiresOn <= limit)
    .sort((a, b) => a.expiresOn!.localeCompare(b.expiresOn!));
}

export interface WeekSummary {
  /** Meals planned in the week (recipes and free-text meals, leftovers included). */
  planned: number;
  /** Times a recipe was cooked during the week (cooking history). */
  cooked: number;
  /** Share of planned recipes that are vegetarian (0–1), null without any recipe. */
  vegetarianShare: number | null;
  /** Prices of the shopping lines bought for this week's recipes, null when none has a price. */
  budget: number | null;
  /** Most cooked recipes overall, at most 3. */
  favorites: { recipeId: string; count: number }[];
}

/** The planning screen's weekly summary, from the week's meals, history and shopping lines. */
export function weekSummary(p: {
  start: string;
  end: string;
  entries: { date: string; recipeId: string | null; leftover?: boolean }[];
  logs: { recipeId: string; date: string }[];
  recipeIngredients: (recipeId: string) => string[] | null;
  items: { price: number | null; recipeIds: string[] }[];
}): WeekSummary {
  const week = p.entries.filter((e) => e.date >= p.start && e.date <= p.end);
  const recipeIds = week.filter((e) => e.recipeId && !e.leftover).map((e) => e.recipeId!);
  const known = recipeIds
    .map((id) => p.recipeIngredients(id))
    .filter((x): x is string[] => x !== null && x.length > 0);
  const veg = known.filter((names) => dietTags(names).includes('vegetarian')).length;
  const ids = new Set(recipeIds);
  const priced = p.items.filter((i) => i.price !== null && i.recipeIds.some((r) => ids.has(r)));
  const counts = new Map<string, number>();
  for (const l of p.logs) counts.set(l.recipeId, (counts.get(l.recipeId) ?? 0) + 1);
  return {
    planned: week.length,
    cooked: p.logs.filter((l) => l.date >= p.start && l.date <= p.end).length,
    vegetarianShare: known.length ? veg / known.length : null,
    budget: priced.length ? Math.round(priced.reduce((s, i) => s + i.price!, 0) * 100) / 100 : null,
    favorites: [...counts]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([recipeId, count]) => ({ recipeId, count })),
  };
}
