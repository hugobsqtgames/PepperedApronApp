import {
  diffFields,
  ENTITY_ORDER,
  ENTITY_PARENTS,
  ENTITY_SCHEMAS,
  SYNC_ENTITIES,
  uuidv7,
  type EntityDataMap,
  type SyncEntity,
} from '@pepperedapron/core';
import { HybridClock, hlcToIso, isHlc } from './clock';
import type { SqlDriver } from './driver';

export interface LocalRecord<E extends SyncEntity = SyncEntity> {
  entity: E;
  id: string;
  data: EntityDataMap[E];
  /** Hybrid logical timestamp of the last change (see clock.ts). */
  hlc: string;
  /** Wall-clock time of the last change, ISO 8601. */
  updatedAt: string;
}

/**
 * One record as exchanged between devices. Deleted records are kept as tombstones (data null) so
 * a deletion always wins over the older copies still present on other devices.
 */
export interface SyncRecord {
  entity: SyncEntity;
  id: string;
  hlc: string;
  deleted: boolean;
  data: Record<string, unknown> | null;
}

interface RecordRow {
  entity: string;
  id: string;
  data: string | null;
  deleted: number;
  hlc: string;
}

const SCHEMA_VERSION = 2;
const ENTITIES = new Set<string>(SYNC_ENTITIES);

type Listener = (changed: Set<SyncEntity>) => void;

/** Validates a record coming from outside (another device, a backup file). */
export function parseSyncRecord(raw: unknown): SyncRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.entity !== 'string' || !ENTITIES.has(r.entity)) return null;
  if (typeof r.id !== 'string' || r.id.length === 0 || r.id.length > 64) return null;
  if (!isHlc(r.hlc)) return null;
  const entity = r.entity as SyncEntity;
  if (r.deleted === true) return { entity, id: r.id, hlc: r.hlc, deleted: true, data: null };
  const parsed = ENTITY_SCHEMAS[entity].safeParse(r.data);
  if (!parsed.success) return null;
  return { entity, id: r.id, hlc: r.hlc, deleted: false, data: parsed.data };
}

/**
 * The single source of truth, stored on the device. Every UI read is served from an in-memory
 * cache mirrored in SQLite; every write is persisted immediately, so the app works without any
 * network and survives being killed at any point. Changes carry a hybrid logical timestamp so
 * copies on several devices (via iCloud) converge: the latest change of each record wins.
 */
export class LocalStore {
  private cache = new Map<SyncEntity, Map<string, LocalRecord>>();
  /** Timestamp of every known record, deleted ones included. */
  private clocks = new Map<string, string>();
  private listeners = new Set<Listener>();
  private queue: Promise<unknown> = Promise.resolve();
  private clock!: HybridClock;
  private rev = 0;

  private constructor(private readonly db: SqlDriver) {}

  static async open(db: SqlDriver, now?: () => number): Promise<LocalStore> {
    const s = new LocalStore(db);
    await s.migrate();
    await s.load(now);
    await s.repairOrphans();
    return s;
  }

  /** Identifies this installation in timestamps and in the iCloud folder. */
  get deviceId(): string {
    return this.clock.deviceId;
  }

  /** Increases with every change of the data (local or merged), persisted across launches. */
  get revision(): number {
    return this.rev;
  }

  /** Serialise mutations (SQLite drivers do not like interleaved transactions). */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async migrate() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);
      CREATE TABLE IF NOT EXISTS records (
        entity TEXT NOT NULL, id TEXT NOT NULL, data TEXT, deleted INTEGER NOT NULL DEFAULT 0,
        hlc TEXT NOT NULL, PRIMARY KEY (entity, id)
      );
    `);
    await this.db.run('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)', [
      'schema_version',
      String(SCHEMA_VERSION),
    ]);
  }

  private async load(now?: () => number) {
    this.cache.clear();
    this.clocks.clear();
    let deviceId = await this.meta('device_id');
    if (!deviceId) {
      deviceId = uuidv7();
      await this.setMeta('device_id', deviceId);
    }
    this.rev = Number((await this.meta('revision')) ?? 0);
    const rows = await this.db.all<RecordRow>('SELECT * FROM records');
    let latest: string | null = null;
    for (const r of rows) {
      this.clocks.set(key(r.entity, r.id), r.hlc);
      if (!latest || r.hlc > latest) latest = r.hlc;
      if (!r.deleted && r.data) this.bucket(r.entity as SyncEntity).set(r.id, this.fromRow(r));
    }
    this.clock = new HybridClock(deviceId, latest, now);
  }

  private bucket(e: SyncEntity) {
    let b = this.cache.get(e);
    if (!b) this.cache.set(e, (b = new Map()));
    return b;
  }

  private fromRow(r: RecordRow): LocalRecord {
    return {
      entity: r.entity as SyncEntity,
      id: r.id,
      data: JSON.parse(r.data ?? 'null'),
      hlc: r.hlc,
      updatedAt: hlcToIso(r.hlc),
    };
  }

  // ------------------------------------------------------------------ events
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  /** Re-render views of these entities without changing data (e.g. a photo file arrived). */
  notify(entities: Iterable<SyncEntity>) {
    this.emit(entities);
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
  count(): number {
    let n = 0;
    for (const b of this.cache.values()) n += b.size;
    return n;
  }
  async meta(key: string): Promise<string | null> {
    return (
      (await this.db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]))
        ?.value ?? null
    );
  }
  async setMeta(key: string, value: string | null) {
    if (value === null) await this.db.run('DELETE FROM meta WHERE key = ?', [key]);
    else
      await this.db.run(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value],
      );
  }

  // ------------------------------------------------------------------ writes
  private async persist(r: SyncRecord) {
    await this.db.run(
      `INSERT INTO records (entity, id, data, deleted, hlc) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(entity, id) DO UPDATE SET data = excluded.data, deleted = excluded.deleted, hlc = excluded.hlc`,
      [r.entity, r.id, r.data ? JSON.stringify(r.data) : null, r.deleted ? 1 : 0, r.hlc],
    );
    this.clocks.set(key(r.entity, r.id), r.hlc);
    if (r.deleted || !r.data) this.bucket(r.entity).delete(r.id);
    else
      this.bucket(r.entity).set(r.id, {
        entity: r.entity,
        id: r.id,
        data: r.data as never,
        hlc: r.hlc,
        updatedAt: hlcToIso(r.hlc),
      });
  }

  private async bump() {
    this.rev++;
    await this.setMeta('revision', String(this.rev));
  }

  /** Create or update a record. Returns the stored record (unchanged if nothing differs). */
  write<E extends SyncEntity>(
    entity: E,
    id: string,
    data: EntityDataMap[E],
  ): Promise<LocalRecord<E>> {
    return this.serial(async () => {
      const prev = this.get(entity, id);
      if (
        prev &&
        diffFields(prev.data as Record<string, unknown>, data as Record<string, unknown>).length ===
          0
      )
        return prev;
      const rec: SyncRecord = {
        entity,
        id,
        hlc: this.clock.tick(),
        deleted: false,
        data: data as Record<string, unknown>,
      };
      await this.db.transaction(async () => {
        await this.persist(rec);
        await this.bump();
      });
      this.emit([entity]);
      return this.get(entity, id)!;
    });
  }

  /** Delete records (kept as tombstones so the deletion reaches the other devices). */
  remove(entity: SyncEntity, ...ids: string[]): Promise<void> {
    return this.removeMany(ids.map((id) => ({ entity, id })));
  }

  removeMany(items: { entity: SyncEntity; id: string }[]): Promise<void> {
    return this.serial(async () => {
      const live = items.filter((i) => this.get(i.entity, i.id));
      if (!live.length) return;
      await this.db.transaction(async () => {
        for (const i of live)
          await this.persist({
            entity: i.entity,
            id: i.id,
            hlc: this.clock.tick(),
            deleted: true,
            data: null,
          });
        await this.bump();
      });
      this.emit(live.map((i) => i.entity));
    });
  }

  /** Children whose parent was deleted (see ENTITY_PARENTS). */
  private orphans(): { entity: SyncEntity; id: string }[] {
    const out: { entity: SyncEntity; id: string }[] = [];
    for (const [entity, parents] of Object.entries(ENTITY_PARENTS) as [
      SyncEntity,
      [string, SyncEntity][],
    ][])
      for (const rec of this.all(entity))
        for (const [field, parent] of parents) {
          const pid = (rec.data as Record<string, unknown>)[field];
          // Only a known deletion counts: a parent not received yet may still arrive.
          if (
            typeof pid === 'string' &&
            !this.get(parent, pid) &&
            this.clocks.has(key(parent, pid))
          ) {
            out.push({ entity, id: rec.id });
            break;
          }
        }
    return out;
  }

  private tombstone(entity: SyncEntity, id: string): SyncRecord {
    return { entity, id, hlc: this.clock.tick(), deleted: true, data: null };
  }

  /** Clean children left by an older version (before the merge removed them). */
  repairOrphans(): Promise<void> {
    return this.removeMany(this.orphans());
  }

  /** "Delete all my data": every record becomes a tombstone, on every synced device. */
  removeAll(keep: SyncEntity[] = []): Promise<void> {
    const items: { entity: SyncEntity; id: string }[] = [];
    for (const [entity, b] of this.cache)
      if (!keep.includes(entity)) for (const id of b.keys()) items.push({ entity, id });
    return this.removeMany(items);
  }

  // ------------------------------------------------------------------ device-to-device merge
  /** Everything this device knows, deleted records included, for the other devices. */
  async snapshot(): Promise<SyncRecord[]> {
    await this.queue;
    const rows = await this.db.all<RecordRow>('SELECT * FROM records ORDER BY entity, id');
    return rows.map((r) => ({
      entity: r.entity as SyncEntity,
      id: r.id,
      hlc: r.hlc,
      deleted: r.deleted === 1,
      data: r.deleted ? null : JSON.parse(r.data ?? 'null'),
    }));
  }

  /**
   * Apply records from another device or a backup: for each record, the latest change wins
   * (deletions included). Invalid records are ignored. Returns how many records changed here.
   */
  merge(raw: unknown[]): Promise<number> {
    return this.serial(async () => {
      const latest = new Map<string, SyncRecord>();
      for (const item of raw) {
        const r = parseSyncRecord(item);
        if (!r) continue;
        const k = key(r.entity, r.id);
        const seen = latest.get(k);
        if (!seen || r.hlc > seen.hlc) latest.set(k, r);
      }
      const incoming = [...latest.values()]
        .filter((r) => {
          const mine = this.clocks.get(key(r.entity, r.id));
          return !mine || r.hlc > mine;
        })
        .sort((a, b) => ENTITY_ORDER.indexOf(a.entity) - ENTITY_ORDER.indexOf(b.entity));
      if (!incoming.length) return 0;
      let orphans: { entity: SyncEntity; id: string }[] = [];
      await this.db.transaction(async () => {
        for (const r of incoming) {
          this.clock.receive(r.hlc);
          await this.persist(r);
        }
        orphans = this.orphans();
        for (const o of orphans) await this.persist(this.tombstone(o.entity, o.id));
        await this.bump();
      });
      this.emit([...incoming, ...orphans].map((r) => r.entity));
      return incoming.length;
    });
  }
}

const key = (entity: string, id: string) => `${entity}:${id}`;
