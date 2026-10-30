import type { Season } from './enums';
import { ingredientSeasons, seasonalProduce } from './seasonal';

/** Moment of the day, for greetings and suggestions. */
export type MealMoment = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'late';

export function mealMoment(d: Date): MealMoment {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < 5 * 60) return 'late';
  if (m < 10 * 60 + 30) return 'breakfast';
  if (m < 14 * 60 + 30) return 'lunch';
  if (m < 17 * 60 + 30) return 'snack';
  if (m < 22 * 60 + 30) return 'dinner';
  return 'late';
}

export interface SeasonalHighlight {
  /** Stable key of the produce ("fraise"). */
  key: string;
  /** The name as written in the user's recipes ("Fraises"), for display. */
  label: string;
  recipeIds: string[];
}

/**
 * Produce in season now that the user's recipes use, most used first ("Les fraises sont de
 * saison : 4 de vos recettes en utilisent").
 */
export function seasonalHighlights(
  recipes: { id: string; ingredients: { name: string }[] }[],
  season: Season,
  max = 3,
): SeasonalHighlight[] {
  const found = new Map<string, SeasonalHighlight>();
  for (const r of recipes)
    for (const i of r.ingredients) {
      const key = seasonalProduce(i.name);
      if (!key || !ingredientSeasons(i.name)?.includes(season)) continue;
      const h = found.get(key) ?? { key, label: i.name, recipeIds: [] };
      if (!h.recipeIds.includes(r.id)) h.recipeIds.push(r.id);
      // The shortest written name reads best ("Fraises" rather than "Fraises gariguettes").
      if (i.name.length < h.label.length) h.label = i.name;
      found.set(key, h);
    }
  return [...found.values()]
    .sort((a, b) => b.recipeIds.length - a.recipeIds.length || a.key.localeCompare(b.key))
    .slice(0, max);
}

/** Small stable hash: the same day gives the same suggestion, the next day another one. */
function dayHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * "Ce soir on mange…" when nothing is planned: among the best candidates (ranked by the app:
 * pantry to use, season, favourites not cooked lately), one per day, stable through the day.
 */
export function pickOfTheDay<T>(ranked: T[], today: string, pool = 5): T | null {
  const top = ranked.slice(0, pool);
  if (!top.length) return null;
  return top[dayHash(today) % top.length]!;
}
