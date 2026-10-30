import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { runtime } from './runtime';

const VERSION_KEY = 'last_seen_version';
const REVIEW_KEY = 'review_asked_at';
/** Apple shows the prompt at most 3 times a year: ask at most every 4 months. */
const REVIEW_GAP_MS = 120 * 86_400_000;

export const appVersion = () => Constants.expoConfig?.version ?? '0';

/**
 * True once after an update (never on the first install): the "What's new" screen is shown.
 * The version is remembered on this device only.
 */
export async function shouldShowWhatsNew(): Promise<boolean> {
  const store = runtime.session?.store;
  if (!store) return false;
  const seen = await store.meta(VERSION_KEY);
  await store.setMeta(VERSION_KEY, appVersion());
  return seen !== null && seen !== appVersion();
}

/**
 * Ask for an App Store rating at a happy moment (a recipe just cooked and given 5 stars), rarely.
 */
export async function maybeAskForReview(rating: number | null) {
  const store = runtime.session?.store;
  if (rating !== 5 || !store) return;
  const last = Number((await store.meta(REVIEW_KEY)) ?? 0);
  if (Date.now() - last < REVIEW_GAP_MS) return;
  if (!(await StoreReview.hasAction().catch(() => false))) return;
  await store.setMeta(REVIEW_KEY, String(Date.now()));
  await StoreReview.requestReview().catch(() => undefined);
}
