import { diffFields, uuidv7, type EntityDataMap, type SyncEntity, type SyncOp, type SyncRecord } from '@pepperedapron/core';
import type { SqlDriver } from './driver';

export type SyncState = 'synced' | 'pending' | 'error';

export interface LocalRecord<E extends SyncEntity = SyncEntity> {
  entity: E;
  id: string;
  ownerId: string | null;
  version: number;
  data: EntityDataMap[E];
  state: SyncState;
  error: string | null;
  updatedAt: string;
}

interface RecordRow {
  entity: string;
  id: string;
  owner_id: string | null;
  version: number;
  data: string | null;
  server_data: string | null;
  deleted: number;
  state: string;
  error: string | null;
  updated_at: string;
}

interface OutboxRow {
  seq: number;
  op_id: string;
  entity: string;
  id: string;
  op: string;
  base_version: number | null;
  changed_fields: string | null;
  data: string | null;
  attempts: number;
  in_flight: number;
}

export interface PendingOp extends SyncOp {
  seq: number;
  attempts: number;
}

export interface PhotoJob {
  localUri: string;
  recipeId: string;
  contentType: string;
  size: number;
  state: 'pending' | 'error';
  attempts: number;
  lastError: string | null;
}

const SCHEMA_VERSION = 1;

type Listener = (changed: Set<SyncEntity>) => void;

/**
 * Local source of truth. Every UI read is served from an in-memory cache mirrored in SQLite;
 * every write is persisted immediately with an outbox operation, so the app works offline and
 * survives being killed at any point.
 */
export class LocalStore {
  private cache = new Map<SyncEntity, Map<string, LocalRecord>>();
  private listeners = new Set<Listener>();
  private photos = new Map<string, PhotoJob>();
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(private readonly db: SqlDriver) {}

  static async open(db: SqlDriver): Promise<LocalStore> {
    const s = new LocalStore(db);
    await s.migrate();
    await s.load();
    return s;
  }

  /** Serialise store mutations (SQLite drivers do not like interleaved transactions). */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async migrate() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);
      CREATE TABLE IF NOT EXISTS records (
        entity TEXT NOT NULL, id TEXT NOT NULL, owner_id TEXT, version INTEGER NOT NULL DEFAULT 0,
        data TEXT, server_data TEXT, deleted INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'synced',
        error TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (entity, id)
      );
      CREATE TABLE IF NOT EXISTS outbox (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, op_id TEXT NOT NULL, entity TEXT NOT NULL, id TEXT NOT NULL, op TEXT NOT NULL,
        base_version INTEGER, changed_fields TEXT, data TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
        in_flight INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS outbox_record ON outbox (entity, id);
      CREATE TABLE IF NOT EXISTS photo_queue (
        local_uri TEXT PRIMARY KEY NOT NULL, recipe_id TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL
      );
    `);
    await this.db.run('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)', ['schema_version', String(SCHEMA_VERSION)]);
    // The app may have been killed during a push: those ops are idempotent and will be re-sent.
    await this.db.run('UPDATE outbox SET in_flight = 0');
  }

  private async load() {
    this.cache.clear();
    const rows = await this.db.all<RecordRow>('SELECT * FROM records WHERE deleted = 0');
    for (const r of rows) this.bucket(r.entity as SyncEntity).set(r.id, this.fromRow(r));
    const photos = await this.db.all<{ local_uri: string; recipe_id: string; content_type: string; size: number; state: string; attempts: number; last_error: string | null }>('SELECT * FROM photo_queue');
    this.photos = new Map(photos.map((p) => [p.recipe_id, { localUri: p.local_uri, recipeId: p.recipe_id, contentType: p.content_type, size: p.size, state: p.state as 'pending', attempts: p.attempts, lastError: p.last_error }]));
  }

  private bucket(e: SyncEntity) {
    let b = this.cache.get(e);
    if (!b) this.cache.set(e, (b = new Map()));
    return b;
  }

  private fromRow(r: RecordRow): LocalRecord {
    return { entity: r.entity as SyncEntity, id: r.id, ownerId: r.owner_id, version: r.version, data: JSON.parse(r.data ?? 'null'), state: r.state as SyncState, error: r.error, updatedAt: r.updated_at };
  }

  // ------------------------------------------------------------------ events
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(entities: Iterable<SyncEntity>) {
    const set = new Set(entities);
    if (!set.size) return;
    for (const l of this.listeners) l(set);
  }

  // ------------------------------------------------------------------ reads
  all<E extends SyncEntity>(entity: E): LocalRecord<E>[] {
    return [...(this.cache.get(entity)?.values() ?? [])] as LocalRecord<E>[];
  }
  get<E extends SyncEntity>(entity: E, id: string): LocalRecord<E> | null {
    return (this.cache.get(entity)?.get(id) as LocalRecord<E> | undefined) ?? null;
  }
  async pendingCount(): Promise<number> {
    return (await this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox'))?.n ?? 0;
  }
  async meta(key: string): Promise<string | null> {
    return (await this.db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]))?.value ?? null;
  }
  async setMeta(key: string, value: string | null) {
    if (value === null) await this.db.run('DELETE FROM meta WHERE key = ?', [key]);
    else await this.db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }

  // ------------------------------------------------------------------ local writes
  /** Create or update a record locally and queue it for sync. Returns the stored record. */
  write<E extends SyncEntity>(entity: E, id: string, data: EntityDataMap[E], ownerId: string | null): Promise<LocalRecord<E>> {
    return this.serial(async () => {
      const prev = this.get(entity, id);
      const changed = diffFields((prev?.data as Record<string, unknown> | undefined) ?? null, data as Record<string, unknown>);
      if (prev && changed.length === 0) return prev;
      const now = new Date().toISOString();
      const rec: LocalRecord<E> = { entity, id, ownerId: prev?.ownerId ?? ownerId, version: prev?.version ?? 0, data, state: 'pending', error: null, updatedAt: now };
      await this.db.transaction(async () => {
        await this.db.run(
          `INSERT INTO records (entity, id, owner_id, version, data, deleted, state, error, updated_at) VALUES (?, ?, ?, ?, ?, 0, 'pending', NULL, ?)
           ON CONFLICT(entity, id) DO UPDATE SET data = excluded.data, deleted = 0, state = 'pending', error = NULL, updated_at = excluded.updated_at`,
          [entity, id, rec.ownerId, rec.version, JSON.stringify(data), now],
        );
        await this.enqueue(entity, id, 'upsert', prev ? rec.version : null, prev ? changed : null, data as Record<string, unknown>);
      });
      this.bucket(entity).set(id, rec);
      this.emit([entity]);
      return rec;
    });
  }

  remove(entity: SyncEntity, id: string): Promise<void> {
    return this.serial(async () => {
      const prev = this.get(entity, id);
      if (!prev) return;
      await this.db.transaction(async () => {
        const neverSynced = prev.version === 0;
        const inFlight = await this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox WHERE entity = ? AND id = ? AND in_flight = 1', [entity, id]);
        await this.db.run('DELETE FROM outbox WHERE entity = ? AND id = ? AND in_flight = 0', [entity, id]);
        if (neverSynced && !inFlight?.n) {
          // Created and deleted while offline: the server never needs to know.
          await this.db.run('DELETE FROM records WHERE entity = ? AND id = ?', [entity, id]);
        } else {
          await this.db.run(`UPDATE records SET deleted = 1, state = 'pending', updated_at = ? WHERE entity = ? AND id = ?`, [new Date().toISOString(), entity, id]);
          await this.insertOp(entity, id, 'delete', prev.version || null, null, null);
        }
      });
      this.bucket(entity).delete(id);
      if (entity === 'recipe') await this.dropPhoto(id);
      this.emit([entity]);
    });
  }

  /** Coalesce with a not-yet-sent operation on the same record, or append a new one. */
  private async enqueue(entity: SyncEntity, id: string, op: 'upsert', baseVersion: number | null, changed: string[] | null, data: Record<string, unknown>) {
    const pending = await this.db.get<OutboxRow>(`SELECT * FROM outbox WHERE entity = ? AND id = ? AND in_flight = 0 AND op = 'upsert' ORDER BY seq DESC LIMIT 1`, [entity, id]);
    if (pending) {
      const prevChanged: string[] | null = pending.changed_fields ? JSON.parse(pending.changed_fields) : null;
      const merged = prevChanged === null || changed === null ? null : [...new Set([...prevChanged, ...changed])];
      await this.db.run('UPDATE outbox SET data = ?, changed_fields = ? WHERE seq = ?', [JSON.stringify(data), merged ? JSON.stringify(merged) : null, pending.seq]);
      return;
    }
    await this.insertOp(entity, id, op, baseVersion, changed, data);
  }

  private async insertOp(entity: SyncEntity, id: string, op: 'upsert' | 'delete', baseVersion: number | null, changed: string[] | null, data: Record<string, unknown> | null) {
    await this.db.run('INSERT INTO outbox (op_id, entity, id, op, base_version, changed_fields, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      uuidv7(), entity, id, op, baseVersion, changed ? JSON.stringify(changed) : null, data ? JSON.stringify(data) : null, new Date().toISOString(),
    ]);
  }

  // ------------------------------------------------------------------ sync plumbing
  takeOps(limit: number): Promise<PendingOp[]> {
    return this.serial(async () => {
      const rows = await this.db.all<OutboxRow>('SELECT * FROM outbox WHERE in_flight = 0 ORDER BY seq LIMIT ?', [limit]);
      if (!rows.length) return [];
      await this.db.run(`UPDATE outbox SET in_flight = 1 WHERE seq IN (${rows.map(() => '?').join(',')})`, rows.map((r) => r.seq));
      return rows.map((r) => ({
        seq: r.seq,
        attempts: r.attempts,
        opId: r.op_id,
        entity: r.entity as SyncEntity,
        id: r.id,
        op: r.op as 'upsert' | 'delete',
        baseVersion: r.base_version,
        changedFields: r.changed_fields ? JSON.parse(r.changed_fields) : null,
        data: r.data ? JSON.parse(r.data) : null,
      }));
    });
  }

  /** The push failed before reaching a verdict (network): keep ops for a later retry. */
  releaseOps(seqs: number[], error: string) {
    return this.serial(async () => {
      if (!seqs.length) return;
      await this.db.run(`UPDATE outbox SET in_flight = 0, attempts = attempts + 1, last_error = ? WHERE seq IN (${seqs.map(() => '?').join(',')})`, [error, ...seqs]);
    });
  }

  /** Apply the server verdict for one pushed op. */
  resolveOp(op: PendingOp, verdict: { status: string; error?: string; record?: SyncRecord }) {
    return this.serial(async () => {
      const changed = new Set<SyncEntity>([op.entity]);
      await this.db.transaction(async () => {
        await this.db.run('DELETE FROM outbox WHERE seq = ?', [op.seq]);
        if (verdict.status === 'gone') {
          // Deleted elsewhere: drop every local trace, including queued edits.
          await this.db.run('DELETE FROM outbox WHERE entity = ? AND id = ?', [op.entity, op.id]);
          await this.db.run('DELETE FROM records WHERE entity = ? AND id = ?', [op.entity, op.id]);
          this.bucket(op.entity).delete(op.id);
          return;
        }
        if (verdict.status === 'rejected' || verdict.status === 'forbidden') {
          await this.db.run(`UPDATE records SET state = 'error', error = ? WHERE entity = ? AND id = ?`, [verdict.error ?? verdict.status, op.entity, op.id]);
          const r = this.get(op.entity, op.id);
          if (r) this.bucket(op.entity).set(op.id, { ...r, state: 'error', error: verdict.error ?? verdict.status });
          return;
        }
        if (verdict.record) await this.applyRecordInTx(verdict.record);
      });
      this.emit(changed);
    });
  }

  /** Apply records pulled from the server (one page) and persist the new cursor atomically. */
  applyPulled(records: SyncRecord[], cursor: number) {
    return this.serial(async () => {
      await this.db.transaction(async () => {
        for (const r of records) await this.applyRecordInTx(r);
        await this.db.run(`INSERT INTO meta (key, value) VALUES ('cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(cursor)]);
      });
      this.emit(records.map((r) => r.entity));
    });
  }

  private async applyRecordInTx(r: SyncRecord) {
    const pending = await this.db.all<OutboxRow>('SELECT * FROM outbox WHERE entity = ? AND id = ?', [r.entity, r.id]);
    if (r.deleted || !r.data) {
      await this.db.run('DELETE FROM outbox WHERE entity = ? AND id = ?', [r.entity, r.id]);
      await this.db.run('DELETE FROM records WHERE entity = ? AND id = ?', [r.entity, r.id]);
      this.bucket(r.entity).delete(r.id);
      return;
    }
    const local = this.get(r.entity, r.id);
    const localRow = await this.db.get<RecordRow>('SELECT * FROM records WHERE entity = ? AND id = ?', [r.entity, r.id]);
    if (localRow && localRow.version > r.version) return; // stale page
    if (localRow?.deleted && pending.some((p) => p.op === 'delete')) return; // our delete is queued
    let data = r.data;
    let state: SyncState = 'synced';
    if (pending.length && local) {
      // Rebase: keep the fields the user changed locally on top of the new server state.
      const fields = pending.some((p) => p.changed_fields === null) ? Object.keys(local.data as object) : [...new Set(pending.flatMap((p) => JSON.parse(p.changed_fields ?? '[]') as string[]))];
      data = { ...r.data };
      for (const f of fields) (data as Record<string, unknown>)[f] = (local.data as Record<string, unknown>)[f];
      state = 'pending';
    }
    await this.db.run(
      `INSERT INTO records (entity, id, owner_id, version, data, server_data, deleted, state, error, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, ?)
       ON CONFLICT(entity, id) DO UPDATE SET owner_id = excluded.owner_id, version = excluded.version, data = excluded.data, server_data = excluded.server_data, deleted = 0, state = excluded.state, error = NULL, updated_at = excluded.updated_at`,
      [r.entity, r.id, r.ownerId, r.version, JSON.stringify(data), JSON.stringify(r.data), state, r.updatedAt],
    );
    this.bucket(r.entity).set(r.id, { entity: r.entity, id: r.id, ownerId: r.ownerId, version: r.version, data: data as never, state, error: null, updatedAt: r.updatedAt });
  }

  /** Scope changed (joined/left a household): drop everything already synced and pull again. */
  resetForResync() {
    return this.serial(async () => {
      await this.db.transaction(async () => {
        await this.db.run(`DELETE FROM records WHERE NOT EXISTS (SELECT 1 FROM outbox o WHERE o.entity = records.entity AND o.id = records.id)`);
        await this.db.run(`DELETE FROM meta WHERE key = 'cursor'`);
      });
      await this.load();
      this.emit(this.cache.keys());
    });
  }

  /** Sign-out / account deletion: wipe all local data. */
  clearAll() {
    return this.serial(async () => {
      await this.db.exec('DELETE FROM records; DELETE FROM outbox; DELETE FROM photo_queue; DELETE FROM meta;');
      await this.db.run('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)', ['schema_version', String(SCHEMA_VERSION)]);
      const all = [...this.cache.keys()];
      this.cache.clear();
      this.photos.clear();
      this.emit(all);
    });
  }

  // ------------------------------------------------------------------ deferred photo uploads
  localPhoto(recipeId: string): PhotoJob | null {
    return this.photos.get(recipeId) ?? null;
  }
  photoJobs(): PhotoJob[] {
    return [...this.photos.values()];
  }
  queuePhoto(job: Omit<PhotoJob, 'state' | 'attempts' | 'lastError'>) {
    return this.serial(async () => {
      await this.db.run('DELETE FROM photo_queue WHERE recipe_id = ?', [job.recipeId]);
      await this.db.run('INSERT INTO photo_queue (local_uri, recipe_id, content_type, size, created_at) VALUES (?, ?, ?, ?, ?)', [job.localUri, job.recipeId, job.contentType, job.size, new Date().toISOString()]);
      this.photos.set(job.recipeId, { ...job, state: 'pending', attempts: 0, lastError: null });
      this.emit(['recipe']);
    });
  }
  photoFailed(recipeId: string, error: string, permanent: boolean) {
    return this.serial(async () => {
      await this.db.run(`UPDATE photo_queue SET attempts = attempts + 1, last_error = ?, state = ? WHERE recipe_id = ?`, [error, permanent ? 'error' : 'pending', recipeId]);
      const p = this.photos.get(recipeId);
      if (p) this.photos.set(recipeId, { ...p, attempts: p.attempts + 1, lastError: error, state: permanent ? 'error' : 'pending' });
      this.emit(['recipe']);
    });
  }
  dropPhoto(recipeId: string) {
    this.photos.delete(recipeId);
    return this.db.run('DELETE FROM photo_queue WHERE recipe_id = ?', [recipeId]);
  }
}
