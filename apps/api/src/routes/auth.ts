import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { displayNameSchema, emailSchema, LOCALES, passwordSchema } from '@pepperedapron/core';
import type { RouteCtx } from '../app';
import { AuthService, type DeviceInfo } from '../auth/service';
import { parse } from '../lib/validate';

const device = z
  .object({ deviceName: z.string().max(80).nullish(), platform: z.string().max(20).nullish(), appVersion: z.string().max(20).nullish() })
  .partial()
  .optional();

export function deviceFrom(req: FastifyRequest, body?: DeviceInfo): DeviceInfo {
  return {
    deviceName: body?.deviceName ?? null,
    platform: body?.platform ?? (req.headers['x-app-platform'] as string | undefined) ?? null,
    appVersion: body?.appVersion ?? (req.headers['x-app-version'] as string | undefined) ?? null,
  };
}

/** Strict limits on credential endpoints (brute force protection), keyed by IP and e-mail. */
const credentialLimit = (max: number, window: string) => ({
  config: {
    rateLimit: {
      max,
      timeWindow: window,
      keyGenerator: (req: FastifyRequest) => {
        const email = (req.body as { email?: unknown } | undefined)?.email;
        return `${req.ip}|${typeof email === 'string' ? email.toLowerCase().slice(0, 254) : ''}`;
      },
    },
  },
});

export async function authRoutes(app: FastifyInstance, { deps, requireAuth }: RouteCtx) {
  const auth = new AuthService(deps);

  app.post('/auth/register', credentialLimit(10, '1 hour'), async (req, reply) => {
    const b = parse(z.object({ email: emailSchema, password: passwordSchema, displayName: displayNameSchema, locale: z.enum(LOCALES).default('en'), device }).strict(), req.body);
    reply.status(201);
    return auth.register(b, deviceFrom(req, b.device));
  });

  app.post('/auth/login', credentialLimit(10, '15 minutes'), async (req) => {
    const b = parse(z.object({ email: emailSchema, password: z.string().min(1).max(200), device }).strict(), req.body);
    return auth.login(b, deviceFrom(req, b.device));
  });

  app.post('/auth/refresh', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(z.object({ refreshToken: z.string().min(20).max(200), device }).strict(), req.body);
    return auth.refresh(b.refreshToken, deviceFrom(req, b.device));
  });

  app.post('/auth/logout', async (req, reply) => {
    const a = await requireAuth(req);
    await auth.revokeSession(a.sessionId, a.userId);
    reply.status(204);
  });

  app.post('/auth/oauth/:provider', credentialLimit(20, '15 minutes'), async (req) => {
    const { provider } = parse(z.object({ provider: z.enum(['apple', 'google', 'facebook']) }), req.params);
    const b = parse(
      z.object({ idToken: z.string().max(8000).optional(), accessToken: z.string().max(4000).optional(), nonce: z.string().max(200).optional(), name: z.string().max(80).optional(), locale: z.enum(LOCALES).optional(), device }).strict(),
      req.body,
    );
    return auth.oauth(provider, b, deviceFrom(req, b.device));
  });

  app.post('/auth/password/forgot', credentialLimit(5, '1 hour'), async (req, reply) => {
    const b = parse(z.object({ email: emailSchema }).strict(), req.body);
    await auth.forgotPassword(b.email);
    reply.status(202);
    return { ok: true };
  });

  app.post('/auth/password/reset', credentialLimit(10, '1 hour'), async (req) => {
    const b = parse(z.object({ token: z.string().min(20).max(200), password: passwordSchema }).strict(), req.body);
    await auth.resetPassword(b.token, b.password);
    return { ok: true };
  });

  app.post('/auth/email/verify', credentialLimit(20, '1 hour'), async (req) => {
    const b = parse(z.object({ token: z.string().min(20).max(200) }).strict(), req.body);
    await auth.verifyEmail(b.token);
    return { ok: true };
  });

  app.post('/auth/email/confirm-change', credentialLimit(20, '1 hour'), async (req) => {
    const b = parse(z.object({ token: z.string().min(20).max(200) }).strict(), req.body);
    await auth.confirmEmailChange(b.token);
    return { ok: true };
  });

  app.post('/auth/email/resend', { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async (req) => {
    const a = await requireAuth(req);
    await auth.resendVerification(a.userId);
    return { ok: true };
  });
}
