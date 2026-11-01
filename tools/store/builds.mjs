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
