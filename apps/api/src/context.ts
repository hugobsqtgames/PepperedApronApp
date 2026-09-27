import type {} from 'fastify';
import type { Db } from './db';
import type { Env } from './env';
import type { Mailer } from './services/mailer';
import type { OAuthVerifier } from './services/oauth';
import type { PushSender } from './services/push';
import type { Storage } from './services/storage';
import type { SafeFetch } from './lib/safeFetch';

export interface AppDeps {
  env: Env;
  db: Db;
  mailer: Mailer;
  storage: Storage;
  push: PushSender;
  oauth: OAuthVerifier;
  fetchUrl: SafeFetch;
  now?: () => Date;
}

export interface AuthUser {
  userId: string;
  sessionId: string;
  role: 'user' | 'admin';
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthUser | null;
  }
}
