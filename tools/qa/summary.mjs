// Sums what the stress campaign really executed, from its logs (tools/qa/stress.sh).
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? '/tmp/pepperedapron-qa';
const status = fs
  .readFileSync(path.join(dir, 'status'), 'utf8')
  .trim()
  .split('\n')
  .map((l) => l.split(' '));
const rows = [];
const counts = new Map();
let tests = 0;
let failed = 0;
for (const [name, code, secs] of status) {
  const log = fs.readFileSync(path.join(dir, `${name}.log`), 'utf8');
  // Vitest: "Tests  281 passed (281)"; Jest: "Tests:       194 passed, 194 total"; node --test: "# pass 3".
  const passed = [
    ...log.matchAll(/Tests\s+(\d+) passed/g),
    ...log.matchAll(/Tests:\s+(?:\d+ failed, )?(?:\d+ skipped, )?(\d+) passed/g),
    ...log.matchAll(/# pass (\d+)/g),
  ]
    .map((m) => Number(m[1]))
    .reduce((a, b) => a + b, 0);
  const fail = [...log.matchAll(/(\d+) failed/g)]
    .map((m) => Number(m[1]))
    .reduce((a, b) => a + b, 0);
  tests += passed;
  failed += fail;
  let n = 0;
  for (const m of log.matchAll(/QA-COUNT (\S+) (\d+)/g)) {
    const key = `${name}: ${m[1]}`;
    counts.set(key, (counts.get(key) ?? 0) + Number(m[2]));
    n += Number(m[2]);
  }
  rows.push(
    `| ${name} | ${code === '0' ? 'OK' : `ÉCHEC (${code})`} | ${passed} | ${fail} | ${n} | ${secs} s |`,
  );
}
const executions = [...counts.values()].reduce((a, b) => a + b, 0);
console.info(`# Campagne de stress — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n`);
console.info('| Étape | Résultat | Tests réussis | Échecs | Exécutions générées | Durée |');
console.info('| --- | --- | --- | --- | --- | --- |');
console.info(rows.join('\n'));
console.info(
  `\n**Tests réussis : ${tests} — échecs : ${failed} — exécutions générées (cas, actions, appuis, contrôles) : ${executions}**\n`,
);
console.info('| Détail | Exécutions |');
console.info('| --- | --- |');
for (const [k, v] of [...counts].sort()) console.info(`| ${k} | ${v} |`);
