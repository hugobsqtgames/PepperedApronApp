import { getUnit } from './units';

export interface KnownPrice {
  price: number;
  quantity: number | null;
  unit: string | null;
}

/**
 * Price of a shopping line from the last price paid for the same product: proportional when the
 * quantities are comparable (1 kg for 3 € → 500 g ≈ 1.50 €), the same price otherwise.
 */
export function estimateLinePrice(
  line: { quantity: number | null; unit: string | null },
  known: KnownPrice,
): number {
  if (line.quantity === null || known.quantity === null) return known.price;
  const a = getUnit(line.unit);
  const b = getUnit(known.unit);
  let ratio: number | null = null;
  if (a && b && a.dimension === b.dimension && (a.dimension !== 'count' || a.key === b.key))
    ratio = (line.quantity * a.toBase) / (known.quantity * b.toBase);
  else if (!a && !b && (line.unit ?? '') === (known.unit ?? ''))
    ratio = line.quantity / known.quantity;
  if (ratio === null || !Number.isFinite(ratio)) return known.price;
  return Math.round(known.price * ratio * 100) / 100;
}

export interface BudgetSummary {
  /** Estimated total of the list. */
  total: number;
  /** Part of it already in the basket (checked items). */
  inCart: number;
  /** Items without a price yet. */
  unpriced: number;
}

export function budgetSummary(items: { price: number | null; checked: boolean }[]): BudgetSummary {
  let total = 0;
  let inCart = 0;
  let unpriced = 0;
  for (const i of items) {
    if (i.price === null) {
      unpriced++;
      continue;
    }
    total += i.price;
    if (i.checked) inCart += i.price;
  }
  return {
    total: Math.round(total * 100) / 100,
    inCart: Math.round(inCart * 100) / 100,
    unpriced,
  };
}

/** "3,5" or "3.50 €" typed by the user → 3.5 (null when not a price). */
export function parsePrice(raw: string): number | null {
  const m = raw.replace(/\s/g, '').match(/^\D*(\d+(?:[.,]\d{1,2})?)\D*$/);
  if (!m) return null;
  const v = Number(m[1]!.replace(',', '.'));
  return Number.isFinite(v) && v >= 0 && v <= 100000 ? v : null;
}
