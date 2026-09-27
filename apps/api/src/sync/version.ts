import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../db';

/**
 * Every write to a synced row takes a version from a global sequence while holding a
 * transaction-scoped advisory lock. Writers therefore commit in version order, so a pull that
 * returns version N can never later miss a row with a version < N (no gaps).
 * The lock is held only for short sync transactions; see docs/SYNC.md for the scaling path.
 */
const SYNC_LOCK_KEY = 747_001;

export async function nextVersion(tx: DbOrTx): Promise<number> {
  const r = await tx.execute<{ v: string | number }>(
    sql`SELECT pg_advisory_xact_lock(${SYNC_LOCK_KEY}), nextval('sync_version_seq') AS v`,
  );
  return Number(r.rows[0]!.v);
}

/** `sync_state` key: highest version among purged tombstones (see AccountService.purgeTombstones). */
export const TOMBSTONE_HORIZON = 'tombstone_horizon';
