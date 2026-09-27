import * as SQLite from 'expo-sqlite';
import type { SqlDriver, SqlValue } from '@pepperedapron/client';

/** expo-sqlite implementation of the platform-agnostic driver used by @pepperedapron/client. */
export async function openSqliteDriver(name: string): Promise<SqlDriver & { close(): Promise<void>; name: string }> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  let depth = 0;
  return {
    name,
    async exec(sql) {
      await db.execAsync(sql);
    },
    async run(sql, params: SqlValue[] = []) {
      await db.runAsync(sql, params);
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return db.getAllAsync<T>(sql, params);
    },
    async get<T>(sql: string, params: SqlValue[] = []) {
      return (await db.getFirstAsync<T>(sql, params)) ?? null;
    },
    async transaction<T>(fn: () => Promise<T>) {
      if (depth > 0) return fn();
      depth++;
      await db.execAsync('BEGIN');
      try {
        const r = await fn();
        await db.execAsync('COMMIT');
        return r;
      } catch (e) {
        await db.execAsync('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
    close: () => db.closeAsync(),
  };
}

export async function deleteDatabase(name: string) {
  try {
    await SQLite.deleteDatabaseAsync(name);
  } catch {
    // Already gone.
  }
}
