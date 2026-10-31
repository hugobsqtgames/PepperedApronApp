// Uploads the App Preview videos (tools/brand/preview/out/app-preview-store[-en].mp4) to the
// App Store page of a version, through the App Store Connect API (fastlane deliver does not
// upload previews). Replaces the iPhone previews already there; never submits anything.
//   ASC_KEY_JSON=path/to/key.json node tools/store/previews.mjs 2.0.0
// key.json: { key_id, issuer_id, key } (the file the store-listing workflow writes).
import crypto from 'node:crypto';
import { api, findApp } from './asc.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const version = process.argv[2] ?? '2.0.0';
/** iPhone 6.9"/6.7" previews: 886×1920 portrait, which is what tools/brand renders. */
const PREVIEW_TYPE = 'IPHONE_67';
const VIDEOS = { 'fr-FR': 'app-preview-store.mp4', 'en-US': 'app-preview-store-en.mp4' };
// Poster frame: the recipe saved on its own, the most telling moment of the story.
const POSTER = '00:00:10:00';

const app = await findApp();
const ver = (
  await api(
    'GET',
    `/v1/apps/${app.id}/appStoreVersions?filter[versionString]=${version}&filter[platform]=IOS`,
  )
).data[0];
if (!ver) throw new Error(`no App Store version ${version}`);
const locs = (await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations`)).data;

for (const [locale, name] of Object.entries(VIDEOS)) {
  const loc = locs.find((l) => l.attributes.locale === locale);
  if (!loc) {
    console.warn(`${locale}: language not on the version, skipped`);
    continue;
  }
  const file = path.join(root, 'tools/brand/preview/out', name);
  const data = fs.readFileSync(file);
  const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appPreviewSets`)).data;
  let set = sets.find((s) => s.attributes.previewType === PREVIEW_TYPE);
  if (!set)
    set = (
      await api('POST', '/v1/appPreviewSets', {
        data: {
          type: 'appPreviewSets',
          attributes: { previewType: PREVIEW_TYPE },
          relationships: {
            appStoreVersionLocalization: {
              data: { type: 'appStoreVersionLocalizations', id: loc.id },
            },
          },
        },
      })
    ).data;
  for (const old of (await api('GET', `/v1/appPreviewSets/${set.id}/appPreviews`)).data)
    await api('DELETE', `/v1/appPreviews/${old.id}`);

  const preview = (
    await api('POST', '/v1/appPreviews', {
      data: {
        type: 'appPreviews',
        attributes: { fileName: name, fileSize: data.length, mimeType: 'video/mp4' },
        relationships: { appPreviewSet: { data: { type: 'appPreviewSets', id: set.id } } },
      },
    })
  ).data;
  for (const op of preview.attributes.uploadOperations) {
    const res = await fetch(op.url, {
      method: op.method,
      headers: Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value])),
      body: data.subarray(op.offset, op.offset + op.length),
    });
    if (!res.ok) throw new Error(`upload ${locale}: ${res.status} ${await res.text()}`);
  }
  await api('PATCH', `/v1/appPreviews/${preview.id}`, {
    data: {
      type: 'appPreviews',
      id: preview.id,
      attributes: {
        uploaded: true,
        sourceFileChecksum: crypto.createHash('md5').update(data).digest('hex'),
        previewFrameTimeCode: POSTER,
      },
    },
  });
  console.info(
    `${locale}: ${name} uploaded (${(data.length / 1e6).toFixed(1)} MB), Apple is processing it`,
  );
}
