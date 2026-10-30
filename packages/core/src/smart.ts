import { z } from 'zod';
import { DIET_TAGS, type DietTag } from './diet';
import { RECIPE_CATEGORIES, SEASONS, type RecipeCategory, type Season } from './enums';
import { LIMITS } from './limits';
import { addDays } from './planning';

/** Rules of a smart collection: a recipe is in it when it meets all of them. */
export const smartRulesSchema = z
  .object({
    diet: z.enum(DIET_TAGS).nullable().default(null),
    maxMinutes: z.number().int().min(1).max(1440).nullable().default(null),
    categories: z.array(z.enum(RECIPE_CATEGORIES)).max(RECIPE_CATEGORIES.length).default([]),
    season: z.enum(SEASONS).nullable().default(null),
    minRating: z.number().int().min(1).max(5).nullable().default(null),
    /** Not cooked for this many days (or never cooked). */
    notCookedDays: z.number().int().min(1).max(3650).nullable().default(null),
  })
  .strict();
export type SmartRules = z.infer<typeof smartRulesSchema>;

export const smartCollectionDataSchema = z
  .object({
    name: z.string().trim().min(1).max(LIMITS.collectionName),
    emoji: z.string().max(16).nullable().default(null),
    rules: smartRulesSchema,
  })
  .strict();
export type SmartCollectionData = z.infer<typeof smartCollectionDataSchema>;

export const EMPTY_SMART_RULES: SmartRules = {
  diet: null,
  maxMinutes: null,
  categories: [],
  season: null,
  minRating: null,
  notCookedDays: null,
};

export interface SmartCandidate {
  diets: DietTag[];
  totalMinutes: number | null;
  category: RecipeCategory | null;
  seasons: Season[];
  rating: number | null;
  /** Last day it was cooked, null if never. */
  lastCooked: string | null;
}

/** Whether a recipe belongs in a smart collection. A recipe without a time fails a time limit. */
export function matchesSmartRules(r: SmartCandidate, rules: SmartRules, today: string): boolean {
  if (rules.diet && !r.diets.includes(rules.diet)) return false;
  if (rules.maxMinutes !== null && (r.totalMinutes === null || r.totalMinutes > rules.maxMinutes))
    return false;
  if (rules.categories.length && (!r.category || !rules.categories.includes(r.category)))
    return false;
  // A recipe without a season goes with every season.
  if (rules.season && r.seasons.length && !r.seasons.includes(rules.season)) return false;
  if (rules.minRating !== null && (r.rating ?? 0) < rules.minRating) return false;
  if (
    rules.notCookedDays !== null &&
    r.lastCooked &&
    r.lastCooked > addDays(today, -rules.notCookedDays)
  )
    return false;
  return true;
}
