import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  variant?: string;
  siteUrl?: string;
  supportEmail?: string;
  appGroup?: string;
};

export const ENV = {
  variant: (extra.variant ?? 'development') as 'development' | 'staging' | 'production',
  /** Public website: privacy policy, terms, help (static pages, no server). */
  siteUrl: (extra.siteUrl ?? 'https://pepperedapron.app').replace(/\/+$/, ''),
  supportEmail: extra.supportEmail ?? 'support@pepperedapron.app',
  appGroup: extra.appGroup ?? 'group.app.pepperedapron.dev',
  appVersion: Constants.expoConfig?.version ?? '2.0.0',
  admob: {
    iosBanner: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER,
    androidBanner: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER,
  },
};

/** A page of the website, in the user's language when available (fr, en, es, de, it). */
export function sitePage(page: 'support' | 'privacy' | 'terms' | 'legal', language: string) {
  const l = language.slice(0, 2);
  return `${ENV.siteUrl}/${['fr', 'en', 'es', 'de', 'it'].includes(l) ? l : 'en'}/${page}`;
}
