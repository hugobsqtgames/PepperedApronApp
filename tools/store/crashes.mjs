// The latest TestFlight crash reports (the ones testers chose to send after a crash), printed
// for debugging: device, build, and the crash log itself.
//   ASC_KEY_JSON=path/to/key.json node tools/store/crashes.mjs [count]
import { api, findApp } from './asc.mjs';

const count = Number(process.argv[2] ?? 3);
const app = await findApp();
const list = await api(
  'GET',
  `/v1/apps/${app.id}/betaFeedbackCrashSubmissions?limit=${count}&sort=-createdDate`,
);
if (!list.data.length) console.info('No crash report sent from TestFlight yet.');
for (const c of list.data) {
  const a = c.attributes;
  console.info(
    `\n===== ${a.createdDate} · ${a.deviceModel} · iOS ${a.osVersion} · ${a.comment ?? ''}`,
  );
  try {
    const log = await api('GET', `/v1/betaFeedbackCrashSubmissions/${c.id}/crashLog`);
    const text = log.data.attributes.logText ?? '';
    console.info(text.slice(0, 60000));
  } catch (e) {
    console.info(`(crash log unavailable: ${e.message})`);
  }
}
