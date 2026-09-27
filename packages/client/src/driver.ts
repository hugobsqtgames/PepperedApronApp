export type SqlValue = string | number | null;

/**
 * Minimal async SQLite interface implemented by expo-sqlite in the app and better-sqlite3 in
 * tests, so the whole offline layer runs (and is tested) outside React Native.
 */
export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  /** Runs fn atomically. Implementations must serialise concurrent transactions. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
