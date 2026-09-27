import { Platform } from 'react-native';
import { ENV } from './env';
import { runtime } from './runtime';

/**
 * Advertising behind a small interface so the ad network can be replaced. Rules (product):
 * banners only in natural places (home feed, search results), never in cook mode, editors,
 * onboarding or checkout-like flows; no interstitials unless remote config enables them.
 */
export interface AdsState {
  ready: boolean;
  personalized: boolean;
}

let state: AdsState = { ready: false, personalized: false };
const listeners = new Set<(s: AdsState) => void>();

export function adsState() {
  return state;
}
export function subscribeAds(l: (s: AdsState) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function adsEnabled() {
  return runtime.config?.ads.enabled ?? false;
}

/** UMP consent (GDPR) first, then SDK initialisation. Safe to call several times. */
export async function initAds() {
  if (state.ready || !adsEnabled()) return;
  try {
    const { default: mobileAds, AdsConsent } = await import('react-native-google-mobile-ads');
    await AdsConsent.requestInfoUpdate();
    await AdsConsent.loadAndShowConsentFormIfRequired();
    const choices = await AdsConsent.getUserChoices();
    const { canRequestAds } = await AdsConsent.getConsentInfo();
    if (!canRequestAds) return;
    await mobileAds().initialize();
    state = { ready: true, personalized: choices.selectPersonalisedAds };
    for (const l of listeners) l(state);
  } catch {
    state = { ready: false, personalized: false };
  }
}

export async function showPrivacyOptions() {
  try {
    const { AdsConsent } = await import('react-native-google-mobile-ads');
    await AdsConsent.showPrivacyOptionsForm();
    const choices = await AdsConsent.getUserChoices();
    state = { ...state, personalized: choices.selectPersonalisedAds };
    for (const l of listeners) l(state);
  } catch {
    /* form unavailable (e.g. outside EEA) */
  }
}

/** Test units outside production; in production, no unit id configured means no ad at all. */
export function bannerUnitId(testId: string): string | null {
  if (ENV.variant !== 'production') return testId;
  return (Platform.OS === 'ios' ? ENV.admob.iosBanner : ENV.admob.androidBanner) ?? null;
}
