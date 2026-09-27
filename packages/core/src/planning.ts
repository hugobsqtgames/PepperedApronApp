import type { MealSlot } from './enums';
import { MEAL_SLOTS } from './enums';

/** Local-date helpers working on "YYYY-MM-DD" strings (no timezone surprises). */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function addDays(iso: string, n: number): string {
  const d = fromIsoDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}

/** Monday-based week start (ISO 8601), configurable for locales starting on Sunday. */
export function startOfWeek(iso: string, weekStartsOn: 0 | 1 = 1): string {
  const d = fromIsoDate(iso);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toIsoDate(d);
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** 6×7 grid of dates covering the month of `iso`, starting on the week start. */
export function monthGrid(iso: string, weekStartsOn: 0 | 1 = 1): string[][] {
  const first = `${iso.slice(0, 7)}-01`;
  const start = startOfWeek(first, weekStartsOn);
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function addMonths(iso: string, n: number): string {
  const d = fromIsoDate(`${iso.slice(0, 7)}-01`);
  d.setMonth(d.getMonth() + n);
  return toIsoDate(d);
}

export interface PlanEntryLike {
  id: string;
  date: string;
  slot: MealSlot;
  position: number;
}

export function slotIndex(slot: MealSlot): number {
  return MEAL_SLOTS.indexOf(slot);
}

export function sortEntries<T extends PlanEntryLike>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || slotIndex(a.slot) - slotIndex(b.slot) || a.position - b.position,
  );
}

/** Next position at the end of a (date, slot) cell. */
export function nextPosition(entries: PlanEntryLike[], date: string, slot: MealSlot): number {
  const cell = entries.filter((e) => e.date === date && e.slot === slot);
  return cell.length ? Math.max(...cell.map((e) => e.position)) + 1 : 0;
}

/** Number of empty lunch/dinner slots in a week — drives the "planning almost empty" nudge. */
export function emptyMainSlots(entries: PlanEntryLike[], weekStart: string): number {
  const days = weekDates(weekStart);
  let empty = 0;
  for (const d of days) {
    for (const s of ['lunch', 'dinner'] as const) {
      if (!entries.some((e) => e.date === d && e.slot === s)) empty++;
    }
  }
  return empty;
}

/** Next upcoming meal from `now` (slot times are conventions used for widgets & reminders). */
export const SLOT_HOURS: Record<MealSlot, number> = { breakfast: 8, lunch: 12, snack: 16, dinner: 19 };

export function nextMeal<T extends PlanEntryLike>(entries: T[], now: Date): T | null {
  const today = toIsoDate(now);
  const hour = now.getHours() + now.getMinutes() / 60;
  const upcoming = sortEntries(entries).filter(
    (e) => e.date > today || (e.date === today && SLOT_HOURS[e.slot] + 1 >= hour),
  );
  return upcoming[0] ?? null;
}
