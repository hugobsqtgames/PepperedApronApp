import { indexRecipes } from '../../modules/ios-integration';
import type { Repos } from '@pepperedapron/client';
import { recipePhotoUri } from '../lib/media';

let last = '';

/**
 * Recipes in the iPhone's search (Spotlight): title, ingredients and photo, indexed on the
 * device. Re-indexed after changes, only when something Spotlight shows has changed.
 */
export async function refreshSpotlight(repos: Repos) {
  const recipes = repos.library().map((r) => ({
    id: r.id,
    title: r.data.title,
    details: r.data.ingredients
      .slice(0, 12)
      .map((i) => i.name)
      .join(', '),
    keywords: [...r.data.tags, ...r.data.ingredients.map((i) => i.name)].slice(0, 30),
    image: recipePhotoUri(r) ?? undefined,
  }));
  const key = JSON.stringify(recipes);
  if (key === last) return;
  try {
    await indexRecipes(recipes);
    last = key;
  } catch {
    // Spotlight is a convenience: the app works the same without it.
  }
}
