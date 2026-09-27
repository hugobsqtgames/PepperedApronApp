import type { Recipe } from '@pepperedapron/client';
import { ENV } from '../services/env';
import { runtime } from '../services/runtime';

export function mediaBaseUrl(): string {
  return (
    runtime.config?.mediaBaseUrl ??
    process.env.EXPO_PUBLIC_MEDIA_URL ??
    `${ENV.apiUrl.replace(/\/+$/, '')}/v1/media`
  ).replace(/\/+$/, '');
}

/** Local file while the upload is pending (offline), otherwise the CDN URL. */
export function recipePhotoUri(r: Pick<Recipe, 'id' | 'data'>): string | null {
  const local = runtime.session?.store.localPhoto(r.id);
  if (local) return local.localUri;
  return r.data.photoKey ? `${mediaBaseUrl()}/${r.data.photoKey}` : null;
}
