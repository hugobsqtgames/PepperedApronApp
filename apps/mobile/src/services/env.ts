import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiUrl?: string;
  variant?: string;
  webDomain?: string;
  appGroup?: string;
};

export const ENV = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? 'http://localhost:3000',
  variant: (extra.variant ?? 'development') as 'development' | 'staging' | 'production',
  webDomain: extra.webDomain ?? 'pepperedapron.app',
  appGroup: extra.appGroup ?? 'group.app.pepperedapron.dev',
  appVersion: Constants.expoConfig?.version ?? '2.0.0',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  googleClientIds: {
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  },
  facebookAppId: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID,
  admob: {
    iosBanner: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER,
    androidBanner: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER,
  },
};
