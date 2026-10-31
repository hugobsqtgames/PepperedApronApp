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
  siteUrl: (extra.siteUrl ?? 'https://hugobsqtgames.github.io/PepperedApronApp').replace(
    /\/+$/,
    '',
  ),
  /** Empty when there is no support address: the contact page is used instead. */
  supportEmail: extra.supportEmail ?? '',
  /** Where to write without e-mail (public page of the project). */
  supportUrl: 'https://github.com/hugobsqtgames/PepperedApronApp/issues',
  appGroup: extra.appGroup ?? 'group.app.pepperedapron.com.dev',
  appVersion: Constants.expoConfig?.version ?? '2.0.0',
};

/** A page of the website, in French or English. */
export function sitePage(page: 'support' | 'privacy' | 'terms' | 'legal', language: string) {
  const l = language.slice(0, 2);
  return `${ENV.siteUrl}/${l === 'fr' ? 'fr' : 'en'}/${page}`;
}
