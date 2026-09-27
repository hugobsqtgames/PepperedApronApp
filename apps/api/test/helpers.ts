import { exportJWK, generateKeyPair, createLocalJWKSet, SignJWT, type JWK } from 'jose';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { uuidv7 } from '@pepperedapron/core';
import { buildApp } from '../src/app';
import type { AppDeps } from '../src/context';
import { createDb, type Db } from '../src/db';
import { loadEnv, type Env } from '../src/env';
import { MemoryMailer } from '../src/services/mailer';
import { DefaultOAuthVerifier } from '../src/services/oauth';
import { MemoryPush } from '../src/services/push';
import { LocalStorage } from '../src/services/storage';
import type { SafeFetch } from '../src/lib/safeFetch';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/pepperedapron_test';

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;
type PrivateKey = KeyPair['privateKey'];

export interface Keys {
  apple: PrivateKey;
  google: PrivateKey;
  facebook: PrivateKey;
}

export interface TestCtx {
  app: FastifyInstance;
  db: Db;
  env: Env;
  mailer: MemoryMailer;
  push: MemoryPush;
  deps: AppDeps;
  keys: Keys;
  fetchResponses: Map<string, { status: number; contentType: string; body: string }>;
  close(): Promise<void>;
}

export async function createTestApp(overrides: Record<string, string> = {}): Promise<TestCtx> {
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    API_PUBLIC_URL: 'http://api.test',
    WEB_PUBLIC_URL: 'https://pepperedapron.test',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: path.join(os.tmpdir(), `pa-storage-${process.pid}`),
    MAIL_DRIVER: 'memory',
    PUSH_DRIVER: 'memory',
    RATE_LIMIT_ENABLED: 'false',
    APPLE_AUDIENCES: 'app.pepperedapron',
    GOOGLE_CLIENT_IDS: 'google-ios-client',
    FACEBOOK_APP_ID: 'fb-app',
    ADMIN_EMAILS: 'admin@pepperedapron.test',
    ...overrides,
  });
  const { db, pool } = createDb(env.DATABASE_URL, 5);
  const mk = async () => generateKeyPair('RS256', { extractable: true });
  const [a, g, f] = await Promise.all([mk(), mk(), mk()]);
  const jwks = async (k: KeyPair, kid: string) => createLocalJWKSet({ keys: [{ ...(await exportJWK(k.publicKey)), kid, alg: 'RS256' } as JWK] });
  const oauth = new DefaultOAuthVerifier(env, { apple: await jwks(a, 'a'), google: await jwks(g, 'g'), facebook: await jwks(f, 'f') });
  const fetchResponses = new Map<string, { status: number; contentType: string; body: string }>();
  const fetchUrl: SafeFetch = async (url) => {
    const r = fetchResponses.get(url);
    if (!r) return { status: 404, url, contentType: 'text/html', body: '' };
    return { ...r, url };
  };
  const mailer = new MemoryMailer();
  const push = new MemoryPush();
  const deps: AppDeps = { env, db, mailer, storage: new LocalStorage(env), push, oauth, fetchUrl };
  const app = await buildApp(deps);
  await app.ready();
  return {
    app, db, env, mailer, push, deps, fetchResponses,
    keys: { apple: a.privateKey, google: g.privateKey, facebook: f.privateKey },
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

export async function signIdToken(key: PrivateKey, kid: string, claims: Record<string, unknown>, opts: { iss: string; aud: string; exp?: string }) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(opts.iss)
    .setAudience(opts.aud)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '10m')
    .sign(key);
}

export const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex');

let counter = 0;
export const uniqueEmail = (p = 'user') => `${p}.${Date.now()}.${++counter}.${Math.random().toString(36).slice(2, 7)}@example.com`;

export interface Client {
  token: string;
  refreshToken: string;
  userId: string;
  email: string;
  req(method: string, url: string, body?: unknown, headers?: Record<string, string>): Promise<LightMyRequestResponse>;
}

export async function register(ctx: TestCtx, name = 'Julie', email = uniqueEmail()): Promise<Client> {
  const res = await ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password: 'correct horse battery', displayName: name, locale: 'fr', device: { deviceName: 'iPhone', platform: 'ios' } } });
  if (res.statusCode !== 201) throw new Error(`register failed ${res.statusCode} ${res.body}`);
  const j = res.json();
  const client: Client = {
    token: j.accessToken,
    refreshToken: j.refreshToken,
    userId: j.user.id,
    email,
    req: (method, url, body, headers = {}) =>
      ctx.app.inject({ method: method as 'GET', url, payload: body as never, headers: { authorization: `Bearer ${client.token}`, ...headers } }),
  };
  return client;
}

/** Latest link sent to an address (e-mail flows). */
export function lastLinkTo(ctx: TestCtx, to: string): string {
  const m = [...ctx.mailer.sent].reverse().find((x) => x.to === to);
  if (!m) throw new Error(`no mail to ${to}`);
  return m.text.match(/https?:\/\/\S+/)![0];
}
export const tokenFromLink = (link: string) => new URL(link).searchParams.get('token')!;

export async function verify(ctx: TestCtx, c: Client) {
  const token = tokenFromLink(lastLinkTo(ctx, c.email));
  const r = await ctx.app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { token } });
  if (r.statusCode !== 200) throw new Error('verify failed');
}

// ------------------------------------------------------------------ sync helpers
export const recipeData = (p: Record<string, unknown> = {}) => ({
  title: 'Tarte aux pommes', description: null, photoKey: null, prepMinutes: 20, cookMinutes: 40, restMinutes: null, totalMinutes: null,
  servings: 6, yieldLabel: null, difficulty: 'easy', seasons: ['autumn'], category: 'dessert', ovenTemperatureC: 180, ovenMode: null,
  notes: null, tips: null, extraInfo: null, source: null, sourceUrl: null, tags: [], visibility: 'private',
  ingredients: [{ id: uuidv7(), group: null, name: 'Pommes', quantity: 4, quantityMax: null, unit: null, note: null }],
  steps: [{ id: uuidv7(), group: null, text: 'Éplucher les pommes.', timerSeconds: null, timerLabel: null }],
  originRecipeId: null, householdId: null, ...p,
});

export const op = (entity: string, id: string, data: Record<string, unknown> | null, extra: Partial<{ op: 'upsert' | 'delete'; baseVersion: number | null; changedFields: string[] | null }> = {}) => ({
  opId: uuidv7(), entity, id, op: extra.op ?? 'upsert', baseVersion: extra.baseVersion ?? null, changedFields: extra.changedFields ?? null, data,
});

export async function push(c: Client, ...ops: ReturnType<typeof op>[]) {
  const r = await c.req('POST', '/v1/sync/push', { ops });
  if (r.statusCode !== 200) throw new Error(`push ${r.statusCode} ${r.body}`);
  return r.json().results as { opId: string; status: string; error?: string; record?: { version: number; data: Record<string, unknown> | null; deleted: boolean; ownerId: string } }[];
}

export async function pullAll(c: Client, cursor = 0, limit = 500) {
  const records: { entity: string; id: string; version: number; deleted: boolean; data: Record<string, unknown> | null }[] = [];
  let cur = cursor;
  let epoch = 0;
  for (let i = 0; i < 100; i++) {
    const r = await c.req('GET', `/v1/sync/pull?cursor=${cur}&limit=${limit}`);
    if (r.statusCode !== 200) throw new Error(`pull ${r.statusCode} ${r.body}`);
    const j = r.json();
    records.push(...j.records);
    cur = j.cursor;
    epoch = j.scopeEpoch;
    if (!j.hasMore) break;
  }
  return { records, cursor: cur, epoch };
}
