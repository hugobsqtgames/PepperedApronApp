// TestFlight feedback sent by testers, read-only: comments with their screenshots, and crash
// reports with their logs (the most useful part: exception and crashed thread).
//   ASC_KEY_JSON=path/to/key.json node tools/store/feedback.mjs [count]
import { api, findApp } from './asc.mjs';

const count = Number(process.argv[2] ?? 50);
const app = await findApp();

const shots = await api(
  'GET',
  `/v1/apps/${app.id}/betaFeedbackScreenshotSubmissions?limit=${count}&sort=-createdDate`,
);
console.info(`\n##### ${shots.data.length} commentaire(s) avec capture`);
for (const s of shots.data) {
  const a = s.attributes;
  console.info(
    `\n=== ${a.createdDate} · build ${a.buildNumber ?? '?'} · ${a.deviceModel ?? ''} iOS ${a.osVersion ?? ''} · ${a.locale ?? ''}`,
  );
  console.info(`COMMENT: ${a.comment ?? '(aucun)'}`);
  for (const img of a.screenshots ?? []) console.info(`SHOT: ${img.url}`);
}

const crashes = await api(
  'GET',
  `/v1/apps/${app.id}/betaFeedbackCrashSubmissions?limit=${count}&sort=-createdDate`,
);
console.info(`\n##### ${crashes.data.length} plantage(s)`);
for (const c of crashes.data) {
  const a = c.attributes;
  console.info(
    `\n=== CRASH ${a.createdDate} · build ${a.buildNumber ?? '?'} · ${a.deviceModel ?? ''} iOS ${a.osVersion ?? ''}`,
  );
  console.info(`COMMENT: ${a.comment ?? '(aucun)'}`);
  try {
    const log = await api('GET', `/v1/betaFeedbackCrashSubmissions/${c.id}/crashLog`);
    const text = log.data.attributes.logText ?? '';
    // Header, exception, and the first frames of the crashed thread.
    const lines = text.split('\n');
    const keep = [];
    let inCrashed = 0;
    for (const l of lines) {
      if (
        /^(Exception|Termination|Triggered by|Crashed Thread|Application Specific|Last Exception)/.test(
          l,
        )
      )
        keep.push(l);
      if (/Thread \d+ Crashed/.test(l)) inCrashed = 25;
      else if (inCrashed > 0) {
        keep.push(l);
        inCrashed--;
      }
    }
    console.info(keep.join('\n') || text.slice(0, 4000));
  } catch (e) {
    console.info(`(journal indisponible : ${e.message})`);
  }
}
