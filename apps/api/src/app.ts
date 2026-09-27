import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { eq } from 'drizzle-orm';
import type { AppDeps, AuthUser } from './context';
import { sessions, users } from './db/schema';
import { verifyAccessToken } from './auth/tokens';
import { AppError, forbidden, unauthorized } from './lib/errors';
import { SafeFetchError } from './lib/safeFetch';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { syncRoutes } from './routes/sync';
import { mediaRoutes } from './routes/media';
import { householdRoutes } from './routes/households';
import { publicRoutes } from './routes/public';
import { miscRoutes } from './routes/misc';
import { adminRoutes } from './routes/admin';
import { webRoutes } from './routes/web';

export type Guard = (req: FastifyRequest) => Promise<AuthUser>;

export interface RouteCtx {
  deps: AppDeps;
  requireAuth: Guard;
  requireAdmin: Guard;
  optionalAuth: (req: FastifyRequest) => Promise<AuthUser | null>;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      deps.env.NODE_ENV === 'test'
        ? false
        : {
            level: deps.env.NODE_ENV === 'production' ? 'info' : 'debug',
            redact: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken'],
          },
    trustProxy: deps.env.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });
  app.decorateRequest('auth', null);

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    enableDraftSpec: true,
    hook: 'preHandler',
    skipOnError: true,
    allowList: () => !deps.env.RATE_LIMIT_ENABLED,
    errorResponseBuilder: () => ({ statusCode: 429, error: { code: 'rate_limited' } }),
  });

  const authenticate = async (req: FastifyRequest): Promise<AuthUser> => {
    if (req.auth) return req.auth;
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw unauthorized('missing_token');
    const { userId, sessionId } = await verifyAccessToken(deps.env, h.slice(7));
    const s = await deps.db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
      columns: { revokedAt: true, userId: true },
    });
    if (!s || s.revokedAt || s.userId !== userId) throw unauthorized('session_revoked');
    const u = await deps.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { role: true },
    });
    if (!u) throw unauthorized('account_deleted');
    req.auth = { userId, sessionId, role: u.role as 'user' | 'admin' };
    return req.auth;
  };
  const ctx: RouteCtx = {
    deps,
    requireAuth: authenticate,
    requireAdmin: async (req) => {
      const a = await authenticate(req);
      if (a.role !== 'admin') throw forbidden('admin_only');
      return a;
    },
    optionalAuth: async (req) => (req.headers.authorization ? authenticate(req) : null),
  };

  app.setErrorHandler((err: unknown, req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, details: err.details } });
    }
    if (err instanceof SafeFetchError) {
      return reply
        .status(err.code === 'blocked_address' || err.code === 'invalid_url' ? 400 : 502)
        .send({ error: { code: `fetch_${err.code}` } });
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode === 429) return reply.status(429).send({ error: { code: 'rate_limited' } });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      const code =
        e.code === 'FST_ERR_CTP_BODY_TOO_LARGE'
          ? 'payload_too_large'
          : e.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE'
            ? 'unsupported_media_type'
            : 'bad_request';
      return reply.status(e.statusCode).send({ error: { code } });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'internal' } });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'not_found' } }));

  app.get('/health', { config: { rateLimit: false } }, async () => {
    await deps.db.execute('select 1' as never);
    return { ok: true };
  });

  await app.register(
    async (v1) => {
      await authRoutes(v1, ctx);
      await meRoutes(v1, ctx);
      await syncRoutes(v1, ctx);
      await mediaRoutes(v1, ctx);
      await householdRoutes(v1, ctx);
      await publicRoutes(v1, ctx);
      await miscRoutes(v1, ctx);
      await adminRoutes(v1, ctx);
    },
    { prefix: '/v1' },
  );
  await webRoutes(app, ctx);
  return app;
}
