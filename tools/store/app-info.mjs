// App-level settings that fastlane deliver does not set: the primary language of the listing
// (French; English is the second language).
//   ASC_KEY_JSON=path/to/key.json node tools/store/app-info.mjs
import { api, findApp } from './asc.mjs';

const PRIMARY_LOCALE = 'fr-FR';

const app = await findApp();
if (app.attributes.primaryLocale === PRIMARY_LOCALE) {
  console.info(`primary language already ${PRIMARY_LOCALE}`);
} else {
  await api('PATCH', `/v1/apps/${app.id}`, {
    data: { type: 'apps', id: app.id, attributes: { primaryLocale: PRIMARY_LOCALE } },
  });
  console.info(`primary language: ${app.attributes.primaryLocale} → ${PRIMARY_LOCALE}`);
}
