import Constants from 'expo-constants';
import { Linking } from 'react-native';
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

/** The App Store page, to write a review from Settings at any time. */
export const APP_STORE_REVIEW_URL = 'https://apps.apple.com/app/id6829014530?action=write-review';
export const openAppStoreReview = () =>
  Promise.resolve()
    .then(() => Linking.openURL(APP_STORE_REVIEW_URL))
    .catch(() => undefined);

const FIRST_DAY_KEY = 'first_use_day';
const LAST_DAY_KEY = 'last_use_day';
const USE_DAYS_KEY = 'use_days';
const TIMED_KEY = 'review_after_use_asked';
const DAY_MS = 86_400_000;

/** Days the app must have been used, and been installed, before the rating prompt. */
export const REVIEW_AFTER_USE_DAYS = 5;
export const REVIEW_AFTER_INSTALL_DAYS = 7;
export const REVIEW_MIN_RECIPES = 3;

/**
 * Whether to ask for a rating after a while in the app: once, when it has been used on 5
 * different days over at least a week and holds a few recipes (someone who has adopted it, not
 * someone trying it), and not right after the other prompt. The window is Apple's own: a custom
 * "rate us" pop-up is refused by App Review (guideline 5.6.1), and Apple decides whether it
 * appears (never in TestFlight, at most 3 times a year).
 */
export function reviewDueAfterUse(p: {
  now: number;
  firstDay: number | null;
  useDays: number;
  recipes: number;
  lastAsked: number;
  alreadyAsked: boolean;
}): boolean {
  if (p.alreadyAsked || p.firstDay === null) return false;
  return (
    p.useDays >= REVIEW_AFTER_USE_DAYS &&
    p.now - p.firstDay >= REVIEW_AFTER_INSTALL_DAYS * DAY_MS &&
    p.recipes >= REVIEW_MIN_RECIPES &&
    p.now - p.lastAsked >= REVIEW_GAP_MS
  );
}

const dayOf = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** Counts the days the app is opened (on this device), then asks for a rating when it is time. */
export async function noteAppUse(recipes: number, now = Date.now()): Promise<boolean> {
  const store = runtime.session?.store;
  if (!store) return false;
  const firstRaw = await store.meta(FIRST_DAY_KEY);
  if (firstRaw === null) await store.setMeta(FIRST_DAY_KEY, String(now));
  let useDays = Number((await store.meta(USE_DAYS_KEY)) ?? 0);
  if ((await store.meta(LAST_DAY_KEY)) !== dayOf(now)) {
    useDays++;
    await store.setMeta(LAST_DAY_KEY, dayOf(now));
    await store.setMeta(USE_DAYS_KEY, String(useDays));
  }
  const due = reviewDueAfterUse({
    now,
    firstDay: firstRaw === null ? now : Number(firstRaw),
    useDays,
    recipes,
    lastAsked: Number((await store.meta(REVIEW_KEY)) ?? 0),
    alreadyAsked: (await store.meta(TIMED_KEY)) !== null,
  });
  if (!due || !(await StoreReview.hasAction().catch(() => false))) return false;
  await store.setMeta(TIMED_KEY, String(now));
  await store.setMeta(REVIEW_KEY, String(now));
  await StoreReview.requestReview().catch(() => undefined);
  return true;
}
