import { loadEnv } from './env';
import { createDb, runMigrations } from './db';
import { buildApp } from './app';
import { createMailer } from './services/mailer';
import { createStorage } from './services/storage';
import { createPush } from './services/push';
import { DefaultOAuthVerifier } from './services/oauth';
import { safeFetch } from './lib/safeFetch';
import { AccountService } from './services/account';

const env = loadEnv();
const { db, pool } = createDb(env.DATABASE_URL, env.DATABASE_POOL_MAX);
if (process.env.RUN_MIGRATIONS_ON_START === 'true') await runMigrations(db);

const deps = {
  env,
  db,
  mailer: createMailer(env),
  storage: createStorage(env),
  push: createPush(env),
  oauth: new DefaultOAuthVerifier(env),
  fetchUrl: safeFetch,
};
const app = await buildApp(deps);

// Lightweight maintenance jobs (idempotent; safe to run on several instances).
const account = new AccountService(deps);
const jobs = [
  setInterval(
    () => void account.purgeObjects().catch((e) => app.log.error(e, 'purgeObjects failed')),
    10 * 60_000,
  ),
  setInterval(
    () => void account.purgeTombstones().catch((e) => app.log.error(e, 'purgeTombstones failed')),
    24 * 3600_000,
  ),
];

const shutdown = async () => {
  jobs.forEach(clearInterval);
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: env.PORT, host: env.HOST });
