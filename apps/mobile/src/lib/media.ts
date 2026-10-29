import { File } from 'expo-file-system';
import { isPhotoKey, type Recipe } from '@pepperedapron/client';
import { photosDir } from '../services/icloud';

/**
 * Local file of a recipe photo, or null when there is none or it has not arrived from iCloud
 * yet (the recipe views re-render when it does).
 */
export function recipePhotoUri(r: Pick<Recipe, 'data'>): string | null {
  const key = r.data.photoKey;
  if (!isPhotoKey(key)) return null;
  const f = new File(photosDir(), key);
  return f.exists ? f.uri : null;
}
