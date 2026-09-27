import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import * as Device from 'expo-device';
import { Directory, File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import {
  ApiClient,
  ApiError,
  LocalStore,
  NetworkError,
  PhotoUploader,
  Repos,
  SyncEngine,
  type AuthResponse,
  type HouseholdView,
  type RemoteConfig,
  type SqlDriver,
} from '@pepperedapron/client';
import { ENV } from './env';
import { deleteDatabase, openSqliteDriver } from './sqlite';
import { loadCachedUser, saveCachedUser, SecureTokenStore, type CachedUser } from './tokens';

export type RuntimeStatus = 'booting' | 'signedOut' | 'ready';

export interface UserSession {
  userId: string;
  store: LocalStore;
  sync: SyncEngine;
  repos: Repos;
  photos: PhotoUploader;
  driver: SqlDriver & { close(): Promise<void>; name: string };
}

const dbName = (userId: string) => `pa-${userId}.db`;
export const photosDir = () => new Directory(Paths.document, 'photos');

type Listener = () => void;

/**
 * Owns everything that lives longer than a screen: API client, the signed-in user's local
 * database and sync engine, remote config and household. Screens only talk to it via hooks.
 */
export class AppRuntime {
  readonly tokens = new SecureTokenStore();
  readonly api: ApiClient;
  status: RuntimeStatus = 'booting';
  user: CachedUser | null = null;
  session: UserSession | null = null;
  household: HouseholdView | null = null;
  config: RemoteConfig | null = null;
  /** Session revoked/expired while local data is still here: ask to sign in again. */
  needsReauth = false;
  private listeners = new Set<Listener>();
  private cleanups: (() => void)[] = [];
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private afterSyncHooks = new Set<() => void>();

  constructor() {
    this.api = new ApiClient({
      baseUrl: ENV.apiUrl,
      tokens: this.tokens,
      headers: { 'X-App-Version': ENV.appVersion, 'X-App-Platform': Platform.OS },
      onSessionExpired: () => {
        this.needsReauth = true;
        this.emit();
      },
    });
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  private emit() {
    for (const l of this.listeners) l();
  }
  onAfterSync(fn: () => void) {
    this.afterSyncHooks.add(fn);
    return () => {
      this.afterSyncHooks.delete(fn);
    };
  }

  device() {
    return { deviceName: Device.deviceName ?? Device.modelName ?? null, platform: Platform.OS, appVersion: ENV.appVersion };
  }

  async boot() {
    const [tokens, user] = await Promise.all([this.tokens.get(), loadCachedUser()]);
    if (tokens && user) {
      this.user = user;
      await this.openSession(user.id);
      this.status = 'ready';
      this.emit();
      void this.refreshRemote();
    } else {
      this.status = 'signedOut';
      this.emit();
    }
    void this.loadConfig();
  }

  async loadConfig() {
    try {
      this.config = await this.api.config();
      this.emit();
    } catch {
      /* offline: keep defaults */
    }
  }

  /** Called after any successful sign-in / sign-up. */
  async completeAuth(res: AuthResponse) {
    const u: CachedUser = {
      id: res.user.id, email: res.user.email, displayName: res.user.displayName, emailVerified: res.user.emailVerified,
      role: res.user.role, avatarKey: res.user.avatarKey, hasPassword: res.user.hasPassword, providers: res.user.providers,
    };
    await saveCachedUser(u);
    if (this.session && this.session.userId !== u.id) await this.closeSession(false);
    this.user = u;
    this.needsReauth = false;
    if (!this.session) await this.openSession(u.id);
    this.status = 'ready';
    this.emit();
    void this.refreshRemote();
  }

  private async openSession(userId: string) {
    const driver = await openSqliteDriver(dbName(userId));
    const store = await LocalStore.open(driver);
    const sync = new SyncEngine(store, this.api, {
      onSignedOut: () => {
        this.needsReauth = true;
        this.emit();
      },
    });
    const householdId = await store.meta('household_id');
    this.household = householdId ? (JSON.parse((await store.meta('household')) ?? 'null') as HouseholdView | null) : null;
    const repos = new Repos(store, () => userId, () => this.household?.id ?? null);
    const photos = new PhotoUploader(store, this.api, putFile, () => this.scheduleSync(300));
    this.session = { userId, store, sync, repos, photos, driver };

    // Sync triggers: local writes (debounced), back online, back to foreground, periodic pull.
    const unsubStore = store.subscribe(() => this.scheduleSync(1500));
    const unsubSync = sync.subscribe((s) => {
      if (s.status === 'idle') for (const h of this.afterSyncHooks) h();
    });
    const net = Network.addNetworkStateListener((st) => {
      if (st.isConnected && st.isInternetReachable !== false) this.scheduleSync(200);
    });
    const app = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') {
        this.scheduleSync(100);
        void this.refreshHousehold();
      }
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') this.scheduleSync(0);
    }, 60_000);
    this.cleanups = [unsubStore, unsubSync, () => net.remove(), () => app.remove(), () => clearInterval(interval)];
    this.scheduleSync(0);
  }

  scheduleSync(delay = 1000) {
    if (!this.session || this.needsReauth) return;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      const s = this.session;
      if (!s) return;
      void s.sync.sync().then(() => s.photos.run());
    }, delay);
  }

  syncNow() {
    this.scheduleSync(0);
  }

  async refreshRemote() {
    try {
      const me = await this.api.me();
      const u: CachedUser = { id: me.id, email: me.email, displayName: me.displayName, emailVerified: me.emailVerified, role: me.role, avatarKey: me.avatarKey, hasPassword: me.hasPassword, providers: me.providers };
      this.user = u;
      await saveCachedUser(u);
      this.emit();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        this.needsReauth = true;
        this.emit();
      }
    }
    await this.refreshHousehold();
  }

  async refreshHousehold() {
    if (!this.session) return;
    try {
      const { household } = await this.api.household();
      await this.setHousehold(household);
    } catch (e) {
      if (!(e instanceof NetworkError)) console.warn('[household] refresh failed', (e as Error).message);
    }
  }

  async setHousehold(h: HouseholdView | null) {
    this.household = h;
    if (this.session) {
      await this.session.store.setMeta('household_id', h?.id ?? null);
      await this.session.store.setMeta('household', h ? JSON.stringify(h) : null);
    }
    this.emit();
    this.scheduleSync(0);
  }

  updateUser(patch: Partial<CachedUser>) {
    if (!this.user) return;
    this.user = { ...this.user, ...patch };
    void saveCachedUser(this.user);
    this.emit();
  }

  private async closeSession(wipe: boolean) {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    if (this.syncTimer) clearTimeout(this.syncTimer);
    const s = this.session;
    this.session = null;
    this.household = null;
    if (!s) return;
    s.sync.stop();
    if (wipe) await s.store.clearAll();
    await s.driver.close();
    if (wipe) {
      await deleteDatabase(s.driver.name);
      try {
        const dir = photosDir();
        if (dir.exists) dir.delete();
      } catch {
        /* nothing to clean */
      }
    }
  }

  /** Sign out: everything local is removed from this device. */
  async signOut() {
    try {
      await this.api.logout();
    } catch {
      await this.tokens.clear();
    }
    await this.closeSession(true);
    await saveCachedUser(null);
    this.user = null;
    this.needsReauth = false;
    this.status = 'signedOut';
    this.emit();
  }

  /** After account deletion (server side already done). */
  async wipeAfterDeletion() {
    await this.tokens.clear();
    await this.closeSession(true);
    await saveCachedUser(null);
    this.user = null;
    this.status = 'signedOut';
    this.emit();
  }
}

/** Uploads a local file to a presigned URL (streamed by the native fetch implementation). */
async function putFile(url: string, headers: Record<string, string>, localUri: string) {
  const file = new File(localUri);
  if (!file.exists) return { status: 410 };
  try {
    const res = await expoFetch(url, { method: 'PUT', headers, body: file });
    return { status: res.status };
  } catch {
    throw new NetworkError();
  }
}

export const runtime = new AppRuntime();
