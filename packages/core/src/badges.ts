import type { RecipeCategory, Season } from './enums';
import type { Cuisine } from './cuisine';
import { fromIsoDate, startOfWeek, addDays } from './planning';

/**
 * Kitchen badges and the year in review, computed from the cooking history (nothing else is
 * stored). A badge is won on the day its count reaches the target; the date never changes after.
 */
export interface CookedLike {
  recipeId: string;
  date: string;
  hasPhoto: boolean;
}
export interface RecipeFacts {
  category: RecipeCategory | null;
  cuisine: Cuisine | null;
  vegetarian: boolean;
  fish: boolean;
  seasons: Season[];
  minutes: number | null;
}

export const BADGES = [
  { id: 'firstCook', target: 1 },
  { id: 'cooks10', target: 10 },
  { id: 'cooks50', target: 50 },
  { id: 'cooks100', target: 100 },
  { id: 'explorer25', target: 25 },
  { id: 'veggie10', target: 10 },
  { id: 'fish5', target: 5 },
  { id: 'baker10', target: 10 },
  { id: 'quick10', target: 10 },
  { id: 'seasonal10', target: 10 },
  { id: 'world5', target: 5 },
  { id: 'world10', target: 10 },
  { id: 'photographer10', target: 10 },
  { id: 'streak4', target: 4 },
] as const;
export type BadgeId = (typeof BADGES)[number]['id'];

export interface BadgeState {
  id: BadgeId;
  target: number;
  progress: number;
  /** Day the badge was won, null while in progress. */
  wonOn: string | null;
}

const SEASON_OF_MONTH: Season[] = [
  'winter',
  'winter',
  'spring',
  'spring',
  'spring',
  'summer',
  'summer',
  'summer',
  'autumn',
  'autumn',
  'autumn',
  'winter',
];
export const seasonOfDate = (iso: string): Season => SEASON_OF_MONTH[fromIsoDate(iso).getMonth()]!;

/** Weeks in a row (ending at the last cooked week) with at least one dish cooked. */
function weekStreaks(dates: string[]): { date: string; streak: number }[] {
  const out: { date: string; streak: number }[] = [];
  let lastWeek: string | null = null;
  let streak = 0;
  for (const d of dates) {
    const w = startOfWeek(d);
    if (w === lastWeek) continue;
    streak = lastWeek && addDays(lastWeek, 7) === w ? streak + 1 : 1;
    lastWeek = w;
    out.push({ date: d, streak });
  }
  return out;
}

export function computeBadges(
  logs: CookedLike[],
  facts: (recipeId: string) => RecipeFacts | null,
): BadgeState[] {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const counts = new Map<BadgeId, number>();
  const won = new Map<BadgeId, string>();
  const bump = (id: BadgeId, date: string, value?: number) => {
    const n = value ?? (counts.get(id) ?? 0) + 1;
    counts.set(id, Math.max(n, counts.get(id) ?? 0));
    const target = BADGES.find((b) => b.id === id)!.target;
    if (n >= target && !won.has(id)) won.set(id, date);
  };
  const recipes = new Set<string>();
  const cuisines = new Set<Cuisine>();
  for (const l of sorted) {
    const f = facts(l.recipeId);
    bump('firstCook', l.date);
    bump('cooks10', l.date);
    bump('cooks50', l.date);
    bump('cooks100', l.date);
    recipes.add(l.recipeId);
    bump('explorer25', l.date, recipes.size);
    if (l.hasPhoto) bump('photographer10', l.date);
    if (!f) continue;
    if (f.vegetarian) bump('veggie10', l.date);
    if (f.fish) bump('fish5', l.date);
    if (f.category === 'baking' || f.category === 'dessert') bump('baker10', l.date);
    if (f.minutes !== null && f.minutes <= 30) bump('quick10', l.date);
    if (f.seasons.includes(seasonOfDate(l.date))) bump('seasonal10', l.date);
    if (f.cuisine) {
      cuisines.add(f.cuisine);
      bump('world5', l.date, cuisines.size);
      bump('world10', l.date, cuisines.size);
    }
  }
  for (const s of weekStreaks(sorted.map((l) => l.date))) bump('streak4', s.date, s.streak);
  return BADGES.map((b) => ({
    id: b.id,
    target: b.target,
    progress: Math.min(counts.get(b.id) ?? 0, b.target),
    wonOn: won.get(b.id) ?? null,
  }));
}

/** Badges won by adding one more cooked dish (to celebrate them at once). */
export function newlyWon(before: BadgeState[], after: BadgeState[]): BadgeId[] {
  const had = new Set(before.filter((b) => b.wonOn).map((b) => b.id));
  return after.filter((b) => b.wonOn && !had.has(b.id)).map((b) => b.id);
}

export interface YearReview {
  year: number;
  cooks: number;
  distinctRecipes: number;
  /** Recipes cooked for the first time ever that year. */
  newRecipes: number;
  photos: number;
  topRecipes: { recipeId: string; count: number }[];
  topCategory: RecipeCategory | null;
  cuisines: Cuisine[];
  topCuisine: Cuisine | null;
  /** Dishes cooked each month, January first. */
  byMonth: number[];
  /** 0 = Sunday. */
  favoriteWeekday: number | null;
  vegetarianShare: number;
}

function top<K>(m: Map<K, number>): K | null {
  let best: K | null = null;
  let n = 0;
  for (const [k, v] of m) if (v > n) [best, n] = [k, v];
  return best;
}

export function yearReview(
  logs: CookedLike[],
  facts: (recipeId: string) => RecipeFacts | null,
  year: number,
): YearReview {
  const prefix = `${year}-`;
  const inYear = logs.filter((l) => l.date.startsWith(prefix));
  const before = new Set(logs.filter((l) => l.date < prefix).map((l) => l.recipeId));
  const perRecipe = new Map<string, number>();
  const perCategory = new Map<RecipeCategory, number>();
  const perCuisine = new Map<Cuisine, number>();
  const perDay = new Map<number, number>();
  const byMonth = Array.from({ length: 12 }, () => 0);
  let veg = 0;
  for (const l of inYear) {
    perRecipe.set(l.recipeId, (perRecipe.get(l.recipeId) ?? 0) + 1);
    const d = fromIsoDate(l.date);
    byMonth[d.getMonth()]!++;
    perDay.set(d.getDay(), (perDay.get(d.getDay()) ?? 0) + 1);
    const f = facts(l.recipeId);
    if (!f) continue;
    if (f.category) perCategory.set(f.category, (perCategory.get(f.category) ?? 0) + 1);
    if (f.cuisine) perCuisine.set(f.cuisine, (perCuisine.get(f.cuisine) ?? 0) + 1);
    if (f.vegetarian) veg++;
  }
  return {
    year,
    cooks: inYear.length,
    distinctRecipes: perRecipe.size,
    newRecipes: [...perRecipe.keys()].filter((id) => !before.has(id)).length,
    photos: inYear.filter((l) => l.hasPhoto).length,
    topRecipes: [...perRecipe]
      .map(([recipeId, count]) => ({ recipeId, count }))
      .sort((a, b) => b.count - a.count || a.recipeId.localeCompare(b.recipeId))
      .slice(0, 3),
    topCategory: top(perCategory),
    cuisines: [...perCuisine.keys()],
    topCuisine: top(perCuisine),
    byMonth,
    favoriteWeekday: top(perDay),
    vegetarianShare: inYear.length ? veg / inYear.length : 0,
  };
}
