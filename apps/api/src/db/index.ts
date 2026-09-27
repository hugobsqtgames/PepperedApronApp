import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as the database. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

// Return BIGINT (int8) as JS numbers: versions stay far below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

export function createDb(url: string, max = 10): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 30_000 });
  pool.on('error', (err) => console.error('[db] idle client error', err.message));
  return { db: drizzle(pool, { schema }), pool };
}

export function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/db → ../../drizzle ; dist → ../drizzle
  return (
    process.env.MIGRATIONS_DIR ??
    path.resolve(here, here.endsWith(path.join('src', 'db')) ? '../../drizzle' : '../drizzle')
  );
}

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}

export { schema };
