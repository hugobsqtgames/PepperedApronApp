import { formatAmount, getUnit, parseIngredientLine, unitLabel, uuidv7, type Ingredient, type Locale, type Step } from '@pepperedapron/core';

export type IngRow = { kind: 'group'; key: string; name: string } | { kind: 'ing'; key: string; text: string; source: Ingredient | null };
export type StepRow = { kind: 'group'; key: string; name: string } | { kind: 'step'; key: string; text: string; timerMin: string; source: Step | null };

/** Human-readable line for an ingredient ("200 g farine (tamisée)") used by the one-line editor. */
export function ingredientToLine(i: Ingredient, locale: Locale): string {
  const amount = formatAmount(i, locale);
  const unit = i.unit ? (getUnit(i.unit) ? unitLabel(i.unit, i.quantityMax ?? i.quantity, locale) : i.unit) : '';
  return [amount, unit, i.name].filter(Boolean).join(' ') + (i.note ? ` (${i.note})` : '');
}

export function toIngRows(list: Ingredient[], locale: Locale): IngRow[] {
  const rows: IngRow[] = [];
  let group: string | null = null;
  for (const i of list) {
    if (i.group && i.group !== group) rows.push({ kind: 'group', key: uuidv7(), name: i.group });
    group = i.group;
    rows.push({ kind: 'ing', key: i.id, text: ingredientToLine(i, locale), source: i });
  }
  return rows;
}

export function fromIngRows(rows: IngRow[], locale: Locale): Ingredient[] {
  const out: Ingredient[] = [];
  let group: string | null = null;
  for (const r of rows) {
    if (r.kind === 'group') {
      group = r.name.trim() || null;
      continue;
    }
    const text = r.text.trim();
    if (!text) continue;
    // Unchanged lines keep their exact structured data (no re-parsing drift).
    if (r.source && ingredientToLine(r.source, locale) === text) {
      out.push({ ...r.source, group });
      continue;
    }
    const p = parseIngredientLine(text);
    if (!p) continue;
    out.push({ id: r.source?.id ?? uuidv7(), group, name: p.name.slice(0, 200), quantity: p.quantity, quantityMax: p.quantityMax, unit: p.unit, note: p.note?.slice(0, 200) ?? null });
  }
  return out;
}

export function toStepRows(list: Step[]): StepRow[] {
  const rows: StepRow[] = [];
  let group: string | null = null;
  for (const s of list) {
    if (s.group && s.group !== group) rows.push({ kind: 'group', key: uuidv7(), name: s.group });
    group = s.group;
    rows.push({ kind: 'step', key: s.id, text: s.text, timerMin: s.timerSeconds ? String(Math.round((s.timerSeconds / 60) * 10) / 10) : '', source: s });
  }
  return rows;
}

export function fromStepRows(rows: StepRow[]): Step[] {
  const out: Step[] = [];
  let group: string | null = null;
  for (const r of rows) {
    if (r.kind === 'group') {
      group = r.name.trim() || null;
      continue;
    }
    const text = r.text.trim();
    if (!text) continue;
    const min = Number(r.timerMin.replace(',', '.'));
    out.push({ id: r.source?.id ?? uuidv7(), group, text: text.slice(0, 3000), timerSeconds: Number.isFinite(min) && min > 0 ? Math.min(Math.round(min * 60), 172800) : null, timerLabel: r.source?.timerLabel ?? null });
  }
  return out;
}

export function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}

export const numOrNull = (s: string): number | null => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
