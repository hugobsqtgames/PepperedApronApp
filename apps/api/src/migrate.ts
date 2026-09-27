import { createDb, runMigrations } from './db';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const { db, pool } = createDb(url, 1);
runMigrations(db)
  .then(() => {
    console.info('Migrations applied');
    return pool.end();
  })
  .catch(async (e) => {
    console.error('Migration failed', e);
    await pool.end();
    process.exit(1);
  });
