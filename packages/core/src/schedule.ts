import { isPassiveText } from './kitchen';
import { detectStepTimer } from './steps';
import { singularize, tokenize } from './text';

/**
 * Cooking several recipes with one pair of hands: how long each step keeps the cook busy
 * (`active`) and how long it then runs on its own (`passive`: baking, simmering, resting), and
 * the order that interleaves the recipes. Estimates only, from the step texts and timers.
 */
export interface StepEstimate {
  /** Minutes the cook is busy. */
  active: number;
  /** Minutes it then runs on its own (oven, simmering, resting). */
  passive: number;
}

const STIR = [
  'remuer',
  'remuant',
  'fouetter',
  'fouettant',
  'saisir',
  'dorer',
  'revenir',
  'sauter',
  'poeler',
  'frire',
  'stir',
  'stirring',
  'whisk',
  'whisking',
  'sear',
  'brown',
  'saute',
  'fry',
];

function stirs(text: string): boolean {
  return tokenize(text)
    .map(singularize)
    .some((t) => STIR.some((w) => t === w || t.startsWith(w)));
}

/**
 * How long a step takes. A timer of 8 minutes or more (or a baking / resting step) leaves the
 * cook free after a short start; shorter timers and stirring keep them at the stove.
 */
export function estimateStep(step: { text: string; timerSeconds: number | null }): StepEstimate & {
  /** True when the duration comes from a timer (not guessed from the text). */
  timed: boolean;
} {
  const seconds = detectStepTimer(step);
  if (seconds) {
    const min = Math.max(1, Math.round(seconds / 60));
    if (isPassiveText(step.text) || (min >= 8 && !stirs(step.text))) {
      const active = Math.min(2, min);
      return { active, passive: min - active, timed: true };
    }
    return { active: min, passive: 0, timed: true };
  }
  if (isPassiveText(step.text)) return { active: 2, passive: 15, timed: false };
  // Preparation: about a minute per 70 characters of instructions, 2 to 10 minutes.
  const active = Math.max(2, Math.min(10, Math.round(step.text.length / 70) + 2));
  return { active, passive: 0, timed: false };
}

export interface PlanRecipe {
  id: string;
  title: string;
  steps: { text: string; timerSeconds: number | null }[];
  /** The recipe's own total time, when known: guessed durations are stretched to match it. */
  totalMinutes?: number | null;
}

/** Durations of every step of a recipe, adjusted to its total time when it has one. */
export function estimateRecipe(r: PlanRecipe): StepEstimate[] {
  const raw = r.steps.map(estimateStep);
  const total = r.totalMinutes ?? null;
  if (!total) return raw.map(({ active, passive }) => ({ active, passive }));
  const known = raw.filter((e) => e.timed).reduce((s, e) => s + e.active + e.passive, 0);
  const guessed = raw.filter((e) => !e.timed).reduce((s, e) => s + e.active + e.passive, 0);
  const k = guessed > 0 ? Math.max(0.5, Math.min(3, (total - known) / guessed)) : 1;
  // The time a recipe announces beyond its steps is mostly waiting (marinating, cooking without
  // a timer): hands-on guesses are stretched less than waits.
  const hands = Math.min(k, 1.5);
  return raw.map((e) =>
    e.timed
      ? { active: e.active, passive: e.passive }
      : {
          active: Math.max(1, Math.round(e.active * hands)),
          passive: Math.round(e.passive * k),
        },
  );
}

export interface PlanItem {
  recipeId: string;
  title: string;
  stepIndex: number;
  text: string;
  timerSeconds: number | null;
  /** Minutes from the start of the session. */
  start: number;
  end: number;
  /** Minutes the cook is busy with it (the rest of the step runs on its own). */
  handsOn: number;
}

export interface CookingPlan {
  /** Length of the whole session, in minutes. */
  minutes: number;
  /** Every step of every recipe, in the order to do them. */
  items: PlanItem[];
  /** When each recipe starts and is ready, in minutes from the start. */
  recipes: { id: string; title: string; start: number; end: number }[];
}

/**
 * The order in which to cook several recipes with one pair of hands.
 *
 * - `asap` (batch cooking): everything done as soon as possible; while one dish bakes or
 *   simmers, the cook moves on to another. The longest recipe goes first.
 * - `together` (a meal): every dish is ready at the same moment. Planned backwards from the end
 *   (the last steps first), so each recipe starts just late enough.
 */
export function cookingPlan(recipes: PlanRecipe[], mode: 'asap' | 'together'): CookingPlan {
  const list = recipes.filter((r) => r.steps.length);
  const seqs = list.map((r) => estimateRecipe(r).map((e, i) => ({ ...e, recipe: r, index: i })));
  type Job = (typeof seqs)[number][number];
  // Planned backwards, a step is "wait, then hands-on" (its hands-on part comes first forwards).
  const order = mode === 'together' ? seqs.map((s) => [...s].reverse()) : seqs;
  const handsFirst = mode === 'asap';
  const next = order.map(() => 0);
  const ready = order.map(() => 0);
  // When the cook's hands are busy: no two hands-on parts at the same time.
  const busy: [number, number][] = [];
  const placed: { job: Job; start: number; end: number }[] = [];
  const lead = (j: Job) => (handsFirst ? 0 : j.passive);
  const remaining = (k: number) =>
    order[k]!.slice(next[k]).reduce((s, j) => s + j.active + j.passive, 0);
  /** Earliest start from `from` whose hands-on part falls in a free moment of the cook. */
  const fit = (from: number, j: Job) => {
    let s = from;
    for (let moved = true; moved;) {
      moved = false;
      const a = s + lead(j);
      for (const [b0, b1] of busy)
        if (a < b1 && a + j.active > b0) {
          s = b1 - lead(j);
          moved = true;
        }
    }
    return s;
  };
  for (;;) {
    const left = order.map((_, k) => k).filter((k) => next[k]! < order[k]!.length);
    if (!left.length) break;
    const starts = new Map(left.map((k) => [k, fit(ready[k]!, order[k]![next[k]!]!)]));
    const t = Math.min(...starts.values());
    const ready_ = left.filter((x) => starts.get(x)! <= t);
    // A meal, planned from the end: the quickest finishing touches go last, so the dishes are
    // ready within minutes of each other. Otherwise the longest recipe goes first.
    const finishing = mode === 'together' ? ready_.filter((x) => next[x] === 0) : [];
    const k = finishing.length
      ? finishing.reduce((a, b) => (order[b]![0]!.active < order[a]![0]!.active ? b : a))
      : ready_.reduce((a, b) => (remaining(b) > remaining(a) ? b : a));
    const job = order[k]![next[k]!]!;
    const start = starts.get(k)!;
    const end = start + job.active + job.passive;
    if (job.active > 0) busy.push([start + lead(job), start + lead(job) + job.active]);
    ready[k] = end;
    next[k]!++;
    placed.push({ job, start, end });
  }
  const minutes = placed.reduce((m, p) => Math.max(m, p.end), 0);
  const items: PlanItem[] = placed
    .map(({ job, start, end }) => {
      const s = mode === 'together' ? minutes - end : start;
      const e = mode === 'together' ? minutes - start : end;
      return {
        recipeId: job.recipe.id,
        title: job.recipe.title,
        stepIndex: job.index,
        text: job.recipe.steps[job.index]!.text,
        timerSeconds: detectStepTimer(job.recipe.steps[job.index]!),
        start: s,
        end: e,
        handsOn: job.active,
      };
    })
    .sort(
      (a, b) =>
        a.start - b.start ||
        list.findIndex((r) => r.id === a.recipeId) - list.findIndex((r) => r.id === b.recipeId) ||
        a.stepIndex - b.stepIndex,
    );
  return {
    minutes,
    items,
    recipes: list.map((r) => {
      const own = items.filter((i) => i.recipeId === r.id);
      return {
        id: r.id,
        title: r.title,
        start: Math.min(...own.map((i) => i.start)),
        end: Math.max(...own.map((i) => i.end)),
      };
    }),
  };
}

/** "HH:MM" of a date, in 24 h. */
export function clockOf(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * When to start so that the meal is ready at `target` ("20:00"), today, or tomorrow when that
 * time has passed. Null when there is no longer time (the start would be in the past).
 */
export function startTimeFor(
  target: string,
  minutes: number,
  now: Date = new Date(),
): { start: Date; ready: Date } | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(target.trim());
  if (!m) return null;
  const ready = new Date(now);
  ready.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (ready.getTime() <= now.getTime()) ready.setDate(ready.getDate() + 1);
  const start = new Date(ready.getTime() - minutes * 60_000);
  return start.getTime() < now.getTime() - 60_000 ? null : { start, ready };
}

/** Times worth offering for "ready at…": the next half hours from when the meal could be ready. */
export function readyTimeChoices(minutes: number, now: Date = new Date(), count = 6): string[] {
  const first = new Date(now.getTime() + (minutes + 5) * 60_000);
  first.setSeconds(0, 0);
  const add = (30 - (first.getMinutes() % 30)) % 30;
  first.setMinutes(first.getMinutes() + add);
  return Array.from({ length: count }, (_, i) =>
    clockOf(new Date(first.getTime() + i * 30 * 60_000)),
  );
}
