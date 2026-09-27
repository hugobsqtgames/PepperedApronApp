import pg from 'pg';
import { createDb, runMigrations } from '../src/db';

export const TEST_DB =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/pepperedapron_test';

export default async function setup() {
  const c = new pg.Client({ connectionString: TEST_DB });
  await c.connect();
  await c.query(
    'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
  );
  await c.end();
  const { db, pool } = createDb(TEST_DB, 1);
  await runMigrations(db);
  await pool.end();
}
