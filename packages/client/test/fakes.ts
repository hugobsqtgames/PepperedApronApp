import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CloudSync,
  LocalStore,
  Repos,
  type CloudDrive,
  type CloudEntry,
  type PhotoFiles,
} from '../src';
import { betterSqliteDriver } from './betterSqliteDriver';

/** A fake clock shared by every simulated device (each may be shifted to simulate a bad date). */
export class TestTime {
  ms = Date.UTC(2026, 9, 1, 12);
  advance(ms = 1000) {
    this.ms += ms;
  }
}

/**
 * The user's private iCloud container, shared by their devices. Files are stored as strings with
 * a modification time, like iCloud Drive; the switch simulates iCloud being signed out/offline.
 */
export class FakeCloud {
  files = new Map<string, { content: string; modifiedAt: number }>();
  available = true;
  /** Paths whose next read fails (file still downloading, or half-written by its device). */
  unreadable = new Set<string>();
  constructor(private readonly time: TestTime) {}

  /** Like APFS, every write gets a distinct modification time. */
  private stamp(p: string) {
    return Math.max(this.time.ms, (this.files.get(p)?.modifiedAt ?? 0) + 1);
  }

  drive(device: SimDevice): CloudDrive {
    const check = () => {
      if (!this.available) throw new Error('iCloud unavailable');
    };
    return {
      isAvailable: async () => this.available,
      list: async (dir) => {
        check();
        const out: CloudEntry[] = [];
        for (const [p, f] of this.files)
          if (p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
            out.push({ name: p.slice(dir.length + 1), modifiedAt: f.modifiedAt });
        return out;
      },
      readText: async (p) => {
        check();
        if (this.unreadable.has(p)) throw new Error('not downloaded yet');
        const f = this.files.get(p);
        if (!f) throw new Error('ENOENT');
        return f.content;
      },
      writeText: async (p, text) => {
        check();
        if (device.failWrites) throw new Error('write interrupted');
        this.files.set(p, { content: text, modifiedAt: this.stamp(p) });
      },
      upload: async (p, uri) => {
        check();
        const content = device.disk.get(uri);
        if (content === undefined) throw new Error('ENOENT');
        this.files.set(p, { content: content.content, modifiedAt: this.stamp(p) });
      },
      download: async (p, uri) => {
        check();
        const f = this.files.get(p);
        if (!f) throw new Error('ENOENT');
        device.disk.set(uri, { content: f.content, modifiedAt: this.time.ms });
      },
      remove: async (p) => {
        check();
        this.files.delete(p);
      },
    };
  }
}

/** A simulated iPhone/iPad: its own SQLite file, photo folder and iCloud switch. */
export class SimDevice {
  store!: LocalStore;
  repos!: Repos;
  cloud!: CloudSync;
  /** Local photo files (uri → content). */
  disk = new Map<string, { content: string; modifiedAt: number }>();
  failWrites = false;
  cloudEnabled = true;
  changes = 0;
  private driver!: ReturnType<typeof betterSqliteDriver>;

  private constructor(
    readonly name: string,
    readonly file: string,
    private readonly icloud: FakeCloud,
    private readonly time: TestTime,
    public skewMs = 0,
  ) {}

  static async create(name: string, icloud: FakeCloud, time: TestTime, skewMs = 0) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), `pa-${name}-`));
    const d = new SimDevice(name, path.join(dir, 'db.sqlite'), icloud, time, skewMs);
    await d.boot();
    return d;
  }

  readonly photos: PhotoFiles = {
    list: async () =>
      [...this.disk].map(([uri, f]) => ({
        name: uri.slice('photos/'.length),
        modifiedAt: f.modifiedAt,
      })),
    uriOf: (key) => `photos/${key}`,
    remove: async (key) => {
      this.disk.delete(`photos/${key}`);
    },
  };

  /** (Re)start the app on the same database — simulates the app being killed and relaunched. */
  async boot() {
    this.driver = betterSqliteDriver(this.file);
    const now = () => this.time.ms + this.skewMs;
    this.store = await LocalStore.open(this.driver, now);
    this.repos = new Repos(this.store);
    this.cloud = new CloudSync(this.store, this.icloud.drive(this), this.photos, {
      enabled: () => this.cloudEnabled,
      onChanged: () => {
        this.changes++;
      },
      now,
    });
  }

  kill() {
    this.driver.close();
  }

  addPhoto(key: string, content = `jpeg:${key}`) {
    this.disk.set(`photos/${key}`, { content, modifiedAt: this.time.ms });
  }
}

export async function syncAll(...devices: SimDevice[]) {
  // Two rounds: everyone uploads, then everyone sees everyone else's latest file.
  for (let i = 0; i < 2; i++) for (const d of devices) await d.cloud.sync();
}
