import Database from 'better-sqlite3';
import type { SqlDriver, SqlValue } from '../src/driver';

/** Node driver used by tests (the app uses expo-sqlite with the same interface). */
export function betterSqliteDriver(file = ':memory:'): SqlDriver & { close(): void } {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  let depth = 0;
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params: SqlValue[] = []) {
      db.prepare(sql).run(...params);
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async get<T>(sql: string, params: SqlValue[] = []) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async transaction<T>(fn: () => Promise<T>) {
      if (depth > 0) return fn();
      depth++;
      db.exec('BEGIN');
      try {
        const r = await fn();
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
    close: () => db.close(),
  };
}
