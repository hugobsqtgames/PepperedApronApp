// The capabilities Apple has on the app's bundle id (read-only): iCloud must be there for the
// sync between the user's iPhone and iPad.
//   ASC_KEY_JSON=path/to/key.json node tools/store/capabilities.mjs app.pepperedapron.com
import { api } from './asc.mjs';

const id = process.argv[2] ?? 'app.pepperedapron.com';
const res = await api('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(id)}&include=bundleIdCapabilities&limit=5`);
for (const b of res.data) {
  if (b.attributes.identifier !== id) continue;
  console.info(`bundle id ${b.attributes.identifier} (${b.attributes.platform})`);
  const caps = (res.included ?? []).filter((c) =>
    b.relationships.bundleIdCapabilities.data.some((r) => r.id === c.id),
  );
  for (const c of caps)
    console.info(
      `  ${c.attributes.capabilityType}` +
        (c.attributes.settings?.length
          ? ` · ${c.attributes.settings
              .map((s) => `${s.key}=${(s.options ?? []).map((o) => o.key).join('|')}`)
              .join(', ')}`
          : ''),
    );
  console.info(caps.some((c) => c.attributes.capabilityType === 'ICLOUD') ? 'ICLOUD: present' : 'ICLOUD: MISSING');
}
