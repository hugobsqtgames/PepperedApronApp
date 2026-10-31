import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withEntitlementsPlist, withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

/** Several plugins add the same App Group; keep the entitlement list unique. */
const withUniqueAppGroups: ConfigPlugin = (c) =>
  withEntitlementsPlist(c, (m) => {
    const k = 'com.apple.security.application-groups';
    if (Array.isArray(m.modResults[k])) m.modResults[k] = [...new Set(m.modResults[k] as string[])];
    return m;
  });

/**
 * The sync files live in the hidden part of the iCloud container: no empty "PepperedApron"
 * folder should appear in the user's iCloud Drive (react-native-cloud-storage makes it public).
 */
const withPrivateICloudContainer: ConfigPlugin = (c) =>
  withInfoPlist(c, (m) => {
    const containers = m.modResults.NSUbiquitousContainers as
      Record<string, Record<string, unknown>> | undefined;
    for (const v of Object.values(containers ?? {}))
      v.NSUbiquitousContainerIsDocumentScopePublic = false;
    return m;
  });

/**
 * Only local notifications are used (no server, no push): the push entitlement that
 * expo-notifications adds is removed, so the App ID needs no Push capability.
 */
const withoutPushEntitlement: ConfigPlugin = (c) =>
  withEntitlementsPlist(c, (m) => {
    delete m.modResults['aps-environment'];
    return m;
  });

/**
 * The development client looks for the developer's computer on the local network. Production
 * builds never do: they must not declare (nor ask for) local network access.
 */
const withoutDevNetworkInProduction: ConfigPlugin = (c) =>
  withInfoPlist(c, (m) => {
    if (process.env.APP_VARIANT === 'production') {
      delete m.modResults.NSLocalNetworkUsageDescription;
      delete m.modResults.NSBonjourServices;
    }
    return m;
  });

/**
 * One codebase, three environments. APP_VARIANT selects bundle ids, names and iCloud containers
 * so that development, staging and production builds can live side by side on a device (each
 * with its own data).
 */
type Variant = 'development' | 'staging' | 'production';
const variant = (process.env.APP_VARIANT ?? 'development') as Variant;
const suffix = variant === 'production' ? '' : `.${variant === 'development' ? 'dev' : 'staging'}`;
const bundleId = `app.pepperedapron.com${suffix}`;
const appGroup = `group.${bundleId}`;
/** Private iCloud container holding the user's synced data (see services/icloud.ts). */
const iCloudContainer = `iCloud.${bundleId}`;
const MICROPHONE_USAGE =
  'PepperedApron records the recipe you dictate, and in cook mode listens for “next” or “repeat” if you turn voice commands on. Everything stays on your iPhone.';
const CAMERA_USAGE =
  'PepperedApron uses the camera to add a photo to your recipes, read a printed or handwritten recipe, a receipt, or the barcode of a product in your pantry.';
const PHOTOS_USAGE =
  'PepperedApron accesses your photos to illustrate your recipes or import a recipe from an image or your latest screenshot.';
// Free GitHub Pages address of the website (apps/site); SITE_URL for a domain of its own.
const siteUrl = process.env.SITE_URL ?? 'https://hugobsqtgames.github.io/PepperedApronApp';
// Support address shown in Help (mail app); empty → the project's contact page instead.
const supportEmail = process.env.SUPPORT_EMAIL ?? 'hugobsqt.collab@gmail.com';

const appName =
  variant === 'production'
    ? 'PepperedApron'
    : `PepperedApron ${variant === 'development' ? 'Dev' : 'Beta'}`;

/**
 * Permission texts and home screen name, per language. The localized name would otherwise show
 * "PepperedApron" for every variant: on one iPhone, the development build and the App Store app
 * must be told apart.
 */
function nativeTexts(lang: 'fr' | 'en') {
  const texts = JSON.parse(
    readFileSync(join(__dirname, 'locales', 'native', `${lang}.json`), 'utf8'),
  ) as { ios: Record<string, string> };
  return { ...texts, ios: { ...texts.ios, CFBundleDisplayName: appName } };
}

const buildConfig = ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appName,
  slug: 'pepperedapron',
  // EAS project (expo.dev/accounts/aazerty12s-team/projects/pepperedapron).
  owner: 'aazerty12s-team',
  // iPhone and iPad only.
  platforms: ['ios'],
  scheme: 'pepperedapron',
  version: '2.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'appVersion' },
  locales: { fr: nativeTexts('fr'), en: nativeTexts('en') },
  ios: {
    bundleIdentifier: bundleId,
    appleTeamId: process.env.APPLE_TEAM_ID ?? '336SM4755V',
    supportsTablet: true,
    requireFullScreen: false,
    icon: {
      light: './assets/icon.png',
      dark: './assets/icon-dark.png',
      tinted: './assets/icon-tinted.png',
    },
    entitlements: { 'com.apple.security.application-groups': [appGroup] },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleAllowMixedLocalizations: true,
      NSSupportsLiveActivities: true,
      // Handoff: the recipe or the cook mode continues on the user's other device.
      // Per variant, so a development build never picks up the App Store app's activities.
      NSUserActivityTypes: [`${bundleId}.recipe`, `${bundleId}.cook`],
      NSSpeechRecognitionUsageDescription:
        'PepperedApron listens to a recipe video you import, the recipe you dictate, or your voice commands in cook mode, on your iPhone. Nothing is sent.',
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      // Nothing is collected: data stays on the device and in the user's own iCloud, and the app
      // contains no ads or analytics SDK. Must match the App Store privacy labels (docs/PRIVACY.md).
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1', '1C8F.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
    },
  },
  plugins: [
    'expo-router',
    'expo-asset',
    'expo-font',
    'expo-image',
    'expo-sharing',
    'expo-status-bar',
    'expo-sqlite',
    'expo-localization',
    'expo-web-browser',
    [
      'react-native-cloud-storage',
      {
        iCloudContainerIdentifier: iCloudContainer,
        iCloudContainerEnvironment: variant === 'development' ? 'Development' : 'Production',
      },
    ],
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
        photosPermission: PHOTOS_USAGE,
        cameraPermission: CAMERA_USAGE,
        microphonePermission: MICROPHONE_USAGE,
      },
    ],
    // Barcodes of pantry products, scanned live (no recording: no microphone).
    ['expo-camera', { cameraPermission: CAMERA_USAGE, microphonePermission: false }],
    // "My latest screenshot": read only when asked, never saved to (no add-only permission).
    ['expo-media-library', { photosPermission: PHOTOS_USAGE, savePhotosPermission: false }],
    // Dictating a recipe (recorded, then transcribed on the device).
    ['expo-audio', { microphonePermission: MICROPHONE_USAGE, enableBackgroundPlayback: false }],
    // The shopping list can be sent to Apple Reminders (no calendar access).
    [
      'expo-calendar',
      {
        calendarPermission: false,
        remindersPermission:
          'PepperedApron adds your shopping list to the Reminders list you choose, so it can be shared with your family.',
      },
    ],
    'expo-notifications',
    [
      'expo-share-intent',
      {
        iosActivationRules: {
          NSExtensionActivationSupportsText: true,
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsWebPageWithMaxCount: 1,
          // Several screenshots of one recipe (a carousel, pages of a book).
          NSExtensionActivationSupportsImageWithMaxCount: 10,
          // A video saved from TikTok or Instagram: its speech is transcribed on the device.
          NSExtensionActivationSupportsMovieWithMaxCount: 1,
          // A PDF (a recipe saved from a site, a scanned page): its text is read on the device.
          NSExtensionActivationSupportsFileWithMaxCount: 1,
        },
        // The target needs its own name: in production the app target is "PepperedApron" too,
        // and the plugin then skipped the extension as "already existing" (no share sheet entry
        // in the App Store build). The share sheet still shows "PepperedApron" (patched option).
        iosShareExtensionName: 'PepperedApronShare',
        iosShareExtensionDisplayName: 'PepperedApron',
        iosAppGroupIdentifier: appGroup,
      },
    ],
    // Order matters: apple-targets must create the widget target before expo-live-activity adds its own.
    '@bacons/apple-targets',
    'expo-live-activity',
  ],
  experiments: { typedRoutes: true },
  extra: {
    variant,
    siteUrl,
    supportEmail,
    appGroup,
    eas: { projectId: process.env.EAS_PROJECT_ID ?? '1e5e322e-39a3-426c-939a-4fdd064b5512' },
  },
});

export default (ctx: ConfigContext): ExpoConfig =>
  withoutDevNetworkInProduction(
    withoutPushEntitlement(withPrivateICloudContainer(withUniqueAppGroups(buildConfig(ctx)))),
  ) as ExpoConfig;
