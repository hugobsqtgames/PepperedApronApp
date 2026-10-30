import { AppState, type AppStateStatus } from 'react-native';
import { CloudStorage } from 'react-native-cloud-storage';
import {
  CloudSync,
  LocalStore,
  removeOrphanPhotos,
  Repos,
  type SqlDriver,
} from '@pepperedapron/client';
import { iCloudDrive, localPhotos } from './icloud';
import { openSqliteDriver } from './sqlite';

export type RuntimeStatus = 'booting' | 'ready' | 'failed';

export interface Session {
  store: LocalStore;
  repos: Repos;
  /** iCloud sync between the user's iPhone and iPad. */
  cloud: CloudSync;
  driver: SqlDriver & { close(): Promise<void>; name: string };
}

const DB_NAME = 'pepperedapron.db';

type Listener = () => void;

/**
 * Owns everything that lives longer than a screen: the local database (the only copy of the
 * user's data, besides their own iCloud) and the iCloud sync. Screens talk to it via hooks.
 */
export class AppRuntime {
  status: RuntimeStatus = 'booting';
  session: Session | null = null;
  cloudEnabled = true;
  private listeners = new Set<Listener>();
  private changeHooks = new Set<() => void>();
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  private emit() {
    for (const l of this.listeners) l();
  }
  /** Called when data arrived from another device (to refresh widgets, reminders…). */
  onRemoteChange(fn: () => void) {
    this.changeHooks.add(fn);
    return () => {
      this.changeHooks.delete(fn);
    };
  }

  async boot() {
    try {
      const driver = await openSqliteDriver(DB_NAME);
      const store = await LocalStore.open(driver);
      const repos = new Repos(store);
      this.cloudEnabled = (await store.meta('icloud_enabled')) !== '0';
      const cloud = new CloudSync(store, iCloudDrive, localPhotos, {
        enabled: () => this.cloudEnabled,
        onChanged: () => {
          for (const h of this.changeHooks) h();
        },
      });
      this.session = { store, repos, cloud, driver };
      this.status = 'ready';
      this.emit();
      this.watchCloud(store);
      // With iCloud off, unused photo files are cleaned here (CloudSync does it otherwise).
      if (!this.cloudEnabled) void removeOrphanPhotos(store, localPhotos).catch(() => undefined);
    } catch (e) {
      console.warn('[runtime] cannot open the database', (e as Error).message);
      this.status = 'failed';
      this.emit();
    }
  }

  /** Sync triggers: local changes (debounced), back to the foreground, iCloud account changes. */
  private watchCloud(store: LocalStore) {
    store.subscribe(() => this.scheduleSync(2000));
    AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') this.scheduleSync(0);
    });
    // Without the native module (Expo Go), iCloud is simply absent: the app works locally.
    try {
      CloudStorage.getDefaultInstance().subscribeToCloudAvailability(() => this.scheduleSync(0));
    } catch {
      // No iCloud.
    }
    // Other devices' changes arrive silently in the container: look again regularly.
    setInterval(() => {
      if (AppState.currentState === 'active') this.scheduleSync(0);
    }, 60_000);
    this.scheduleSync(0);
  }

  scheduleSync(delay = 1000) {
    const cloud = this.session?.cloud;
    if (!cloud) return;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void cloud.sync(), delay);
  }

  syncNow() {
    return this.session?.cloud.sync() ?? Promise.resolve();
  }

  async setCloudEnabled(enabled: boolean) {
    const s = this.session;
    if (!s) return;
    this.cloudEnabled = enabled;
    await s.store.setMeta('icloud_enabled', enabled ? '1' : '0');
    this.emit();
    await this.syncNow();
  }
}

export const runtime = new AppRuntime();
