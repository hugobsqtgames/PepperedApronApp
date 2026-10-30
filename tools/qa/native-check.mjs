// Native configuration of one variant, as Xcode will see it: runs `expo prebuild` (no install,
// nothing signed), checks every target, then removes the generated ios/ folder.
//   APP_VARIANT=production node tools/qa/native-check.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = path.join(root, 'apps/mobile');
// @expo/plist comes with Expo's config plugins (not a direct dependency of the app).
const fromApp = createRequire(path.join(app, 'package.json'));
const fromExpo = createRequire(fromApp.resolve('expo/package.json'));
const fromPlugins = createRequire(fromExpo.resolve('@expo/config-plugins'));
const plist = fromPlugins('@expo/plist').default;
const variant = process.env.APP_VARIANT ?? 'development';
const bundle = `app.pepperedapron${{ development: '.dev', staging: '.staging', production: '' }[variant]}`;
const group = `group.${bundle}`;

let checks = 0;
const failures = [];
const check = (ok, what) => {
  checks++;
  if (!ok) failures.push(what);
};

execFileSync('npx', ['expo', 'prebuild', '--platform', 'ios', '--no-install', '--clean'], {
  cwd: app,
  env: { ...process.env, APP_VARIANT: variant, CI: '1' },
  stdio: 'ignore',
});
const ios = path.join(app, 'ios');
try {
  const read = (f) => plist.parse(fs.readFileSync(path.join(ios, f), 'utf8'));
  // The app's folder is named like its Xcode project ("PepperedApron", "PepperedApronDev"…).
  const appDir = fs
    .readdirSync(ios)
    .find((d) => d.endsWith('.xcodeproj'))
    .replace(/\.xcodeproj$/, '');
  const info = read(`${appDir}/Info.plist`);
  const ent = read(`${appDir}/${appDir}.entitlements`);
  const pbx = fs.readFileSync(path.join(ios, `${appDir}.xcodeproj/project.pbxproj`), 'utf8');

  // Targets and identifiers.
  const ids = new Set(
    [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;/g)].map((m) => m[1]),
  );
  for (const suffix of [
    '',
    '.PepperedApronWidgets',
    '.PepperedApronIntents',
    '.LiveActivity',
    '.share-extension',
  ])
    check(ids.has(`${bundle}${suffix}`), `target ${bundle}${suffix}`);
  check(
    [...ids].every((i) => i.startsWith(bundle)),
    `every target under ${bundle}`,
  );
  for (const m of pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g))
    check(Number(m[1]) >= 16.2, `deployment target ${m[1]} ≥ 16.2`);

  // Entitlements: same App Group everywhere, the variant's own iCloud container, no push.
  check(ent['com.apple.security.application-groups']?.join() === group, 'app group (app)');
  check(!('aps-environment' in ent), 'no push entitlement (local notifications only)');
  check(
    ent['com.apple.developer.icloud-container-identifiers']?.join() === `iCloud.${bundle}`,
    'iCloud container of the variant',
  );
  for (const f of [
    '.targets/PepperedApronWidgets/generated.entitlements',
    '.targets/PepperedApronIntents/generated.entitlements',
    'PepperedApronShare/ShareExtension.entitlements',
  ]) {
    const p = path.join(ios, f);
    check(
      fs.existsSync(p) && read(f)['com.apple.security.application-groups']?.join() === group,
      `app group (${f})`,
    );
  }

  // Info.plist of the app.
  check(
    info.CFBundleDisplayName ===
      (variant === 'production'
        ? 'PepperedApron'
        : variant === 'development'
          ? 'PepperedApron Dev'
          : 'PepperedApron Beta'),
    'display name',
  );
  for (const k of [
    'NSCameraUsageDescription',
    'NSPhotoLibraryUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSSpeechRecognitionUsageDescription',
    'NSRemindersFullAccessUsageDescription',
  ])
    check(typeof info[k] === 'string' && info[k].length > 20, `usage text ${k}`);
  check(info.ITSAppUsesNonExemptEncryption === false, 'export compliance');
  check(
    info.NSUserActivityTypes?.includes(`${bundle}.recipe`) &&
      info.NSUserActivityTypes?.includes(`${bundle}.cook`),
    'Handoff types of the variant',
  );
  check(
    info.CFBundleURLTypes?.some((t) => t.CFBundleURLSchemes?.includes('pepperedapron')),
    'URL scheme',
  );
  check(
    info.NSUbiquitousContainers?.[`iCloud.${bundle}`]
      ?.NSUbiquitousContainerIsDocumentScopePublic === false,
    'private iCloud folder',
  );
  check(
    !('UIBackgroundModes' in info) || !info.UIBackgroundModes.includes('location'),
    'no background location',
  );
  if (variant === 'production')
    check(!('NSLocalNetworkUsageDescription' in info), 'no local network in production');
  else check('NSLocalNetworkUsageDescription' in info, 'dev client can reach the computer');
  for (const lang of ['fr', 'en']) {
    const strings = path.join(ios, appDir, 'Supporting', `${lang}.lproj`, 'InfoPlist.strings');
    const alt = path.join(ios, appDir, `${lang}.lproj`, 'InfoPlist.strings');
    const f = fs.existsSync(strings) ? strings : alt;
    check(
      fs.existsSync(f) && /NSMicrophoneUsageDescription/.test(fs.readFileSync(f, 'utf8')),
      `${lang} permission texts`,
    );
    const home = fs.existsSync(f)
      ? fs.readFileSync(f, 'utf8').match(/CFBundleDisplayName"? = "([^"]+)"/)?.[1]
      : null;
    check(
      home === info.CFBundleDisplayName,
      `${lang} home screen name = ${info.CFBundleDisplayName}`,
    );
  }
  // Share extension: present, named "PepperedApron" in the share sheet, accepts what the app reads.
  const shareInfo = fs.existsSync(path.join(ios, 'PepperedApronShare/ShareExtension-Info.plist'))
    ? read('PepperedApronShare/ShareExtension-Info.plist')
    : null;
  check(shareInfo !== null, 'share extension Info.plist');
  check(shareInfo?.CFBundleDisplayName === 'PepperedApron', 'share sheet name');
  const rule = shareInfo?.NSExtension?.NSExtensionAttributes?.NSExtensionActivationRule ?? {};
  for (const k of [
    'NSExtensionActivationSupportsWebURLWithMaxCount',
    'NSExtensionActivationSupportsImageWithMaxCount',
    'NSExtensionActivationSupportsMovieWithMaxCount',
    'NSExtensionActivationSupportsFileWithMaxCount',
    'NSExtensionActivationSupportsText',
  ])
    check(Boolean(rule[k]), `share sheet accepts ${k}`);
  // Extensions' Info.plist.
  check(
    read('../targets/widgets/Info.plist').NSExtension?.NSExtensionPointIdentifier ===
      'com.apple.widgetkit-extension',
    'widget extension point',
  );
  check(
    read('../targets/intents/Info.plist').EXAppExtensionAttributes?.EXExtensionPointIdentifier ===
      'com.apple.appintents-extension',
    'App Intents extension point',
  );
} finally {
  fs.rmSync(ios, { recursive: true, force: true });
}

console.info(`QA-COUNT native.${variant}.checks ${checks}`);
if (failures.length) {
  console.error(`native ${variant}: ${failures.length} failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.info(`native ${variant}: ${checks} checks OK`);
