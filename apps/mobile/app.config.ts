import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * One codebase, three environments. APP_VARIANT selects bundle ids, names and endpoints so that
 * development, staging and production builds can live side by side on a device.
 */
type Variant = 'development' | 'staging' | 'production';
const variant = (process.env.APP_VARIANT ?? 'development') as Variant;
const suffix = variant === 'production' ? '' : `.${variant === 'development' ? 'dev' : 'staging'}`;
const bundleId = `app.pepperedapron${suffix}`;
const webDomain = process.env.WEB_DOMAIN ?? (variant === 'production' ? 'pepperedapron.app' : `${variant}.pepperedapron.app`);
const appGroup = `group.${bundleId}`;

// Google's official test ad units are used unless real ids are provided (never ship test ids).
const ADMOB_IOS_APP_ID = process.env.ADMOB_IOS_APP_ID ?? 'ca-app-pub-3940256099942544~1458002511';
const ADMOB_ANDROID_APP_ID = process.env.ADMOB_ANDROID_APP_ID ?? 'ca-app-pub-3940256099942544~3347511713';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: variant === 'production' ? 'PepperedApron' : `PepperedApron ${variant === 'development' ? 'Dev' : 'Beta'}`,
  slug: 'pepperedapron',
  scheme: 'pepperedapron',
  version: '2.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'appVersion' },
  locales: {
    fr: './locales/native/fr.json',
    en: './locales/native/en.json',
    es: './locales/native/es.json',
    de: './locales/native/de.json',
    it: './locales/native/it.json',
  },
  ios: {
    bundleIdentifier: bundleId,
    appleTeamId: process.env.APPLE_TEAM_ID,
    supportsTablet: true,
    requireFullScreen: false,
    usesAppleSignIn: true,
    icon: { light: './assets/icon.png', dark: './assets/icon-dark.png', tinted: './assets/icon-tinted.png' },
    associatedDomains: [`applinks:${webDomain}`, `webcredentials:${webDomain}`],
    entitlements: { 'com.apple.security.application-groups': [appGroup] },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleAllowMixedLocalizations: true,
      NSSupportsLiveActivities: true,
      UIBackgroundModes: ['remote-notification'],
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1', '1C8F.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['E174.1'] },
      ],
    },
  },
  android: {
    package: bundleId,
    adaptiveIcon: {
      backgroundColor: '#1F4D3A',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: true,
    permissions: ['android.permission.CAMERA', 'android.permission.POST_NOTIFICATIONS', 'android.permission.SCHEDULE_EXACT_ALARM'],
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.ACCESS_FINE_LOCATION'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: webDomain, pathPrefix: '/r/' },
          { scheme: 'https', host: webDomain, pathPrefix: '/p/' },
          { scheme: 'https', host: webDomain, pathPrefix: '/join/' },
          { scheme: 'https', host: webDomain, pathPrefix: '/auth/' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-secure-store',
    'expo-localization',
    'expo-apple-authentication',
    'expo-web-browser',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: '#F7F1E6',
        dark: { image: './assets/splash-icon-dark.png', backgroundColor: '#121814' },
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'PepperedApron accesses your photos to illustrate your recipes or import a recipe from an image.',
        cameraPermission: 'PepperedApron uses the camera to add a photo to your recipes or read a printed recipe.',
        microphonePermission: false,
      },
    ],
    ['expo-notifications', { icon: './assets/notification-icon.png', color: '#1F4D3A' }],
    [
      'expo-share-intent',
      {
        iosActivationRules: {
          NSExtensionActivationSupportsText: true,
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsWebPageWithMaxCount: 1,
          NSExtensionActivationSupportsImageWithMaxCount: 1,
        },
        iosShareExtensionName: 'PepperedApron',
        iosAppGroupIdentifier: appGroup,
        androidIntentFilters: ['text/*', 'image/*'],
      },
    ],
    [
      'react-native-google-mobile-ads',
      {
        iosAppId: ADMOB_IOS_APP_ID,
        androidAppId: ADMOB_ANDROID_APP_ID,
        // Nothing is initialised before the user's consent choice (UMP).
        delayAppMeasurementInit: true,
        userTrackingUsageDescription: 'Allowing tracking shows more relevant ads. PepperedApron stays free either way.',
      },
    ],
    'expo-live-activity',
    '@bacons/apple-targets',
    ...(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
      ? ([['@sentry/react-native', { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT }]] as [string, unknown][])
      : []),
  ],
  experiments: { typedRoutes: true },
  extra: {
    variant,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    webDomain,
    appGroup,
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
