// The latest builds received by App Store Connect, with their processing state (read-only):
// tells whether an EAS build was compiled, uploaded and processed by Apple.
//   ASC_KEY_JSON=path/to/key.json node tools/store/builds.mjs [count]
import { api, findApp } from './asc.mjs';

const count = Number(process.argv[2] ?? 5);
const app = await findApp();
const list = await api('GET', `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=${count}`);
for (const b of list.data) {
  const a = b.attributes;
  console.info(
    `build ${a.version} · uploaded ${a.uploadedDate} · ${a.processingState}` +
      `${a.expired ? ' · expired' : ''} · min iOS ${a.minOsVersion ?? '?'}`,
  );
}

// The versions on the App Store side (read-only): which are live, in review, being prepared,
// and the version numbers TestFlight has builds for.
const versions = await api(
  'GET',
  `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10&fields[appStoreVersions]=versionString,appStoreState,appVersionState,createdDate`,
);
for (const v of versions.data)
  console.info(
    `version ${v.attributes.versionString} · ${v.attributes.appVersionState ?? v.attributes.appStoreState} · created ${v.attributes.createdDate}`,
  );
const pre = await api('GET', `/v1/preReleaseVersions?filter[app]=${app.id}&limit=10&sort=-version`);
console.info(`testflight versions: ${pre.data.map((p) => p.attributes.version).join(', ')}`);
