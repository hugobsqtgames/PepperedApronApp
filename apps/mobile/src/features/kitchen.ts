import {
  computeBadges,
  computeTotalMinutes,
  dietTags,
  isMeatOrFish,
  recipeCuisine,
  recipeSeasons,
  type BadgeState,
  type CookedLike,
  type RecipeFacts,
} from '@pepperedapron/core';
import type { Repos } from '@pepperedapron/client';

/** Fish dishes for the badges: a fish or seafood ingredient, no meat. */
const FISH =
  /poisson|saumon|cabillaud|thon|truite|dorade|daurade|crevette|gambas?|moule|hu[iî]tre|calamar|poulpe|crabe|homard|fish|salmon|cod|tuna|trout|shrimp|prawn|mussel|oyster|squid|crab|lobster|seafood/i;

/** What the badges and the year in review need to know about each cooked recipe. */
export function kitchenHistory(repos: Repos): {
  logs: CookedLike[];
  facts: (id: string) => RecipeFacts | null;
} {
  const cache = new Map<string, RecipeFacts | null>();
  const facts = (id: string): RecipeFacts | null => {
    if (cache.has(id)) return cache.get(id)!;
    const r = repos.recipe(id);
    let f: RecipeFacts | null = null;
    if (r) {
      const names = r.data.ingredients.map((i) => i.name);
      f = {
        category: r.data.category,
        cuisine: recipeCuisine(r.data),
        vegetarian: dietTags(names).includes('vegetarian'),
        fish:
          names.some((n) => FISH.test(n)) && names.filter(isMeatOrFish).every((n) => FISH.test(n)),
        seasons: recipeSeasons(r.data),
        minutes: computeTotalMinutes(r.data),
      };
    }
    cache.set(id, f);
    return f;
  };
  const logs = repos.allCookLogs().map((l) => ({
    recipeId: l.data.recipeId,
    date: l.data.date,
    hasPhoto: !!l.data.photoKey,
  }));
  return { logs, facts };
}

export function badgesOf(repos: Repos): BadgeState[] {
  const h = kitchenHistory(repos);
  return computeBadges(h.logs, h.facts);
}
