import { DATA_VERSION } from '@pepperedapron/core';
import type { LocalStore, SyncRecord } from './store';

/**
 * A private cloud folder shared by the user's devices (iCloud Drive app container on iOS).
 * Paths are relative to the folder root and use "/" separators.
 */
export interface CloudDrive {
  isAvailable(): Promise<boolean>;
  /** Files directly inside `dir` ([] when the folder does not exist yet). */
  list(dir: string): Promise<CloudEntry[]>;
  readText(path: string): Promise<string>;
  /** Creates parent folders as needed and replaces the file atomically. */
  writeText(path: string, text: string): Promise<void>;
  /** Copy a local file into the cloud folder. */
  upload(path: string, localUri: string): Promise<void>;
  /** Copy a cloud file to a local path (downloading it first if needed). */
  download(path: string, localUri: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface CloudEntry {
  name: string;
  /** Last modification (ms since epoch), when the platform reports it. */
  modifiedAt: number | null;
}

/** The device's own photo files (one file per photo key, e.g. "0190….jpg"). */
export interface PhotoFiles {
  list(): Promise<CloudEntry[]>;
  uriOf(key: string): string;
  remove(key: string): Promise<void>;
}

export const SYNC_FORMAT = 'pepperedapron-sync/1';
export const EXPORT_FORMAT = 'pepperedapron-export/1';

export interface DeviceFile {
  format: typeof SYNC_FORMAT;
  deviceId: string;
  writtenAt: string;
  records: SyncRecord[];
}

export type CloudStatus = 'off' | 'unavailable' | 'syncing' | 'idle' | 'error';

export interface CloudSnapshot {
  status: CloudStatus;
  lastSyncedAt: string | null;
}

export interface CloudSyncOptions {
  /** Whether the user enabled iCloud sync on this device. */
  enabled: () => boolean;
  /** Called after a run that changed local data (to refresh widgets, reminders…). */
  onChanged?: () => void;
  now?: () => number;
  /** Unreferenced photos are deleted only after this delay, so a photo being added is safe. */
  orphanGraceMs?: number;
}

const DAY = 86_400_000;
const PHOTO_KEY_RE = /^[0-9a-f-]{36}\.jpg$/;

/** Recipes reference their photo by file name; anything else is ignored. */
export const isPhotoKey = (k: unknown): k is string =>
  typeof k === 'string' && PHOTO_KEY_RE.test(k);

/**
 * Keeps the devices of one user in sync through their private cloud folder, without any server:
 * - every device writes its full state (tombstones included) to `devices/<deviceId>.json`, so
 *   no two devices ever write the same file and the cloud never has to resolve conflicts;
 * - every device merges all the files it finds: per record, the latest change wins;
 * - photos are plain files in `photos/`, uploaded before the records that reference them.
 * Single-flight: a run requested while one is in progress is performed right after it.
 */
export class CloudSync {
  private running: Promise<void> | null = null;
  private again = false;
  private snap: CloudSnapshot = { status: 'idle', lastSyncedAt: null };
  private listeners = new Set<(s: CloudSnapshot) => void>();
  private readonly now: () => number;

  constructor(
    private readonly store: LocalStore,
    private readonly drive: CloudDrive,
    private readonly photos: PhotoFiles,
    private readonly o: CloudSyncOptions,
  ) {
    this.now = o.now ?? Date.now;
    if (!o.enabled()) this.snap = { ...this.snap, status: 'off' };
  }

  get snapshot() {
    return this.snap;
  }
  subscribe(fn: (s: CloudSnapshot) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private set(p: Partial<CloudSnapshot>) {
    this.snap = { ...this.snap, ...p };
    for (const l of this.listeners) l(this.snap);
  }

  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.runOnce();
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runOnce() {
    if (!this.o.enabled()) return this.set({ status: 'off' });
    const available = await this.drive.isAvailable().catch(() => false);
    if (!available) return this.set({ status: 'unavailable' });
    this.set({ status: 'syncing' });
    try {
      const before = this.store.revision;
      const { complete } = await this.pull();
      const downloaded = await this.syncPhotos(complete);
      await this.push();
      const at = new Date(this.now()).toISOString();
      await this.store.setMeta('cloud_last_sync', at);
      this.set({ status: 'idle', lastSyncedAt: at });
      if (downloaded) this.store.notify(['recipe']);
      if (this.store.revision !== before || downloaded) this.o.onChanged?.();
    } catch (e) {
      console.warn('[cloud] sync failed', (e as Error).message);
      this.set({ status: 'error' });
    }
  }

  /** Merge every device file that changed since we last read it. */
  private async pull(): Promise<{ complete: boolean }> {
    // After an update that understands new fields, read every file again once.
    const fresh = (await this.store.meta('cloud_data_version')) !== String(DATA_VERSION);
    const seen = (fresh ? {} : JSON.parse((await this.store.meta('cloud_seen')) ?? '{}')) as Record<
      string,
      number
    >;
    const files = (await this.drive.list('devices')).filter((f) => f.name.endsWith('.json'));
    let complete = true;
    for (const f of files) {
      if (f.modifiedAt !== null && seen[f.name] === f.modifiedAt) continue;
      let parsed: Partial<DeviceFile>;
      try {
        parsed = JSON.parse(await this.drive.readText(`devices/${f.name}`)) as Partial<DeviceFile>;
      } catch {
        // Still downloading, or being written by its device: retried on the next run.
        complete = false;
        continue;
      }
      if (parsed.format !== SYNC_FORMAT || !Array.isArray(parsed.records)) {
        // Written by a newer version of the app: never guess, wait for this one to update.
        complete = false;
        continue;
      }
      await this.store.merge(parsed.records);
      if (f.modifiedAt !== null) seen[f.name] = f.modifiedAt;
    }
    await this.store.setMeta('cloud_seen', JSON.stringify(seen));
    if (fresh) await this.store.setMeta('cloud_data_version', String(DATA_VERSION));
    return { complete };
  }

  /** Upload this device's full state if it changed since the last upload. */
  private async push() {
    const path = `devices/${this.store.deviceId}.json`;
    const uploaded = Number((await this.store.meta('cloud_revision')) ?? -1);
    const mine = (await this.drive.list('devices')).find(
      (f) => f.name === `${this.store.deviceId}.json`,
    );
    if (mine && uploaded === this.store.revision) return;
    const revision = this.store.revision;
    const file: DeviceFile = {
      format: SYNC_FORMAT,
      deviceId: this.store.deviceId,
      writtenAt: new Date(this.now()).toISOString(),
      records: await this.store.snapshot(),
    };
    await this.drive.writeText(path, JSON.stringify(file));
    await this.store.setMeta('cloud_revision', String(revision));
  }

  /** Returns how many photos were downloaded. */
  private async syncPhotos(complete: boolean): Promise<number> {
    const referenced = referencedPhotos(this.store);
    const local = new Map((await this.photos.list()).map((e) => [e.name, e]));
    const cloud = new Map((await this.drive.list('photos')).map((e) => [e.name, e]));
    const grace = this.o.orphanGraceMs ?? DAY;
    const old = (e: CloudEntry) => e.modifiedAt !== null && this.now() - e.modifiedAt > grace;

    let downloaded = 0;
    for (const key of referenced) {
      try {
        if (local.has(key) && !cloud.has(key))
          await this.drive.upload(`photos/${key}`, this.photos.uriOf(key));
        else if (!local.has(key) && cloud.has(key)) {
          await this.drive.download(`photos/${key}`, this.photos.uriOf(key));
          downloaded++;
        }
      } catch (e) {
        // One photo failing (still uploading from another device…) must not block the rest.
        console.warn('[cloud] photo transfer failed', key, (e as Error).message);
      }
    }
    await removeOrphanPhotos(this.store, this.photos, grace, this.now, [...local.values()]);
    // Only clean the cloud when every device file was read: an unread one may use the photo.
    if (complete)
      for (const [key, e] of cloud)
        if (isPhotoKey(key) && !referenced.has(key) && old(e))
          await this.drive.remove(`photos/${key}`);
    return downloaded;
  }
}

/** Photo keys used by at least one recipe. */
export function referencedPhotos(store: LocalStore): Set<string> {
  const keys = new Set<string>();
  for (const r of store.all('recipe')) if (isPhotoKey(r.data.photoKey)) keys.add(r.data.photoKey);
  return keys;
}

/**
 * Delete local photo files no recipe uses any more (replaced, removed, recipe deleted). Recent
 * files are kept: the editor saves a photo before the recipe that will reference it.
 */
export async function removeOrphanPhotos(
  store: LocalStore,
  photos: PhotoFiles,
  graceMs = DAY,
  now: () => number = Date.now,
  entries?: CloudEntry[],
): Promise<number> {
  const referenced = referencedPhotos(store);
  let removed = 0;
  for (const e of entries ?? (await photos.list())) {
    if (!isPhotoKey(e.name) || referenced.has(e.name)) continue;
    if (e.modifiedAt === null || now() - e.modifiedAt <= graceMs) continue;
    await photos.remove(e.name);
    removed++;
  }
  return removed;
}

/** A portable copy of all the user's data (Settings → My data → Export). */
export async function exportData(store: LocalStore, now = Date.now) {
  const records = (await store.snapshot()).filter((r) => !r.deleted);
  return { format: EXPORT_FORMAT, exportedAt: new Date(now()).toISOString(), records };
}

export class ImportFormatError extends Error {
  constructor() {
    super('invalid_backup');
  }
}

/** Restore an export (or merge it into existing data: the latest version of each item wins). */
export async function importData(store: LocalStore, json: string): Promise<number> {
  let parsed: { format?: unknown; records?: unknown };
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    throw new ImportFormatError();
  }
  if (
    (parsed.format !== EXPORT_FORMAT && parsed.format !== SYNC_FORMAT) ||
    !Array.isArray(parsed.records)
  )
    throw new ImportFormatError();
  return store.merge(parsed.records);
}
