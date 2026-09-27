import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ApiClient,
  LocalStore,
  MemoryTokenStore,
  PhotoUploader,
  Repos,
  SyncEngine,
  type Tokens,
} from '../src';
import { createTestApp, type TestCtx } from '../../../apps/api/test/helpers';
import { betterSqliteDriver } from './betterSqliteDriver';

export interface Server {
  ctx: TestCtx;
  url: string;
  close(): Promise<void>;
}

export async function startServer(): Promise<Server> {
  const ctx = await createTestApp();
  const url = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  // Presigned upload URLs must point to the real listening port.
  (ctx.env as { API_PUBLIC_URL: string }).API_PUBLIC_URL = url;
  return { ctx, url, close: () => ctx.close() };
}

/** A simulated phone/tablet: its own SQLite file, tokens and network switch. */
export class Device {
  online = true;
  failServer = false;
  store!: LocalStore;
  api!: ApiClient;
  sync!: SyncEngine;
  repos!: Repos;
  photos!: PhotoUploader;
  userId = '';
  signedOut = false;
  readonly tokens = new MemoryTokenStore();
  private driver!: ReturnType<typeof betterSqliteDriver>;
  private constructor(
    private readonly server: Server,
    readonly file: string,
  ) {}

  static async create(server: Server, name: string): Promise<Device> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), `pa-${name}-`));
    const d = new Device(server, path.join(dir, 'db.sqlite'));
    await d.boot();
    return d;
  }

  /** (Re)start the app on the same SQLite file — simulates the app being killed and relaunched. */
  async boot() {
    this.driver = betterSqliteDriver(this.file);
    this.store = await LocalStore.open(this.driver);
    const fetchImpl: typeof fetch = async (input, init) => {
      if (!this.online) throw new TypeError('Network request failed');
      if (this.failServer)
        return new Response(JSON.stringify({ error: { code: 'internal' } }), { status: 503 });
      return fetch(input, init);
    };
    this.api = new ApiClient({
      baseUrl: this.server.url,
      tokens: this.tokens,
      fetchImpl,
      onSessionExpired: () => (this.signedOut = true),
    });
    this.sync = new SyncEngine(this.store, this.api, {
      setTimer: () => 0,
      clearTimer: () => undefined,
    });
    this.repos = new Repos(
      this.store,
      () => this.userId,
      () => this.householdId,
    );
    this.photos = new PhotoUploader(this.store, this.api, async (url, headers, localUri) => {
      if (!this.online) throw new TypeError('Network request failed');
      const body = await fs.readFile(localUri);
      const r = await fetch(url, { method: 'PUT', headers, body });
      return { status: r.status };
    });
  }
  householdId: string | null = null;

  kill() {
    this.driver.close();
  }

  async signUp(email: string, name = 'Julie') {
    const r = await this.api.register({
      email,
      password: 'correct horse battery',
      displayName: name,
      locale: 'fr',
    });
    this.userId = r.user.id;
    return r;
  }
  async signIn(email: string) {
    const r = await this.api.login({ email, password: 'correct horse battery' });
    this.userId = r.user.id;
    return r;
  }
  async setTokens(t: Tokens) {
    await this.tokens.set(t);
  }
}
