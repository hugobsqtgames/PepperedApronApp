import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { displayNameSchema, emailSchema, LOCALES, passwordSchema } from '@pepperedapron/core';
import type { RouteCtx } from '../app';
import { AuthService } from '../auth/service';
import { pushTokens, sessions, uploads, users } from '../db/schema';
import { forbidden, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { AccountService } from '../services/account';
import { SyncService } from '../sync/service';

export async function meRoutes(app: FastifyInstance, { deps, requireAuth }: RouteCtx) {
  const auth = new AuthService(deps);
  const account = new AccountService(deps);

  app.get('/me', async (req) => {
    const a = await requireAuth(req);
    return auth.publicUser(a.userId);
  });

  app.patch('/me', async (req) => {
    const a = await requireAuth(req);
    const b = parse(z.object({ displayName: displayNameSchema.optional(), avatarKey: z.string().max(300).nullable().optional(), locale: z.enum(LOCALES).optional() }).strict(), req.body);
    const current = await deps.db.query.users.findFirst({ where: eq(users.id, a.userId) });
    if (b.avatarKey) {
      const up = await deps.db.query.uploads.findFirst({ where: and(eq(uploads.key, b.avatarKey), eq(uploads.ownerId, a.userId), eq(uploads.status, 'ready')) });
      if (!up) throw forbidden('photo_not_owned');
    }
    await deps.db.update(users).set({ ...b, updatedAt: new Date() }).where(eq(users.id, a.userId));
    if (b.avatarKey !== undefined && current?.avatarKey && current.avatarKey !== b.avatarKey) {
      await new SyncService(deps).maybeDeleteObject(deps.db, current.avatarKey);
    }
    return auth.publicUser(a.userId);
  });

  app.post('/me/password', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const a = await requireAuth(req);
    const b = parse(z.object({ currentPassword: z.string().max(200).nullable(), newPassword: passwordSchema }).strict(), req.body);
    await auth.changePassword(a.userId, a.sessionId, b.currentPassword, b.newPassword);
    return { ok: true };
  });

  app.post('/me/email', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = await requireAuth(req);
    const b = parse(z.object({ newEmail: emailSchema, password: z.string().max(200).nullable() }).strict(), req.body);
    await auth.requestEmailChange(a.userId, b.newEmail, b.password);
    reply.status(202);
    return { ok: true };
  });

  app.get('/me/sessions', async (req) => {
    const a = await requireAuth(req);
    const rows = await deps.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, a.userId), isNull(sessions.revokedAt)))
      .orderBy(desc(sessions.lastUsedAt));
    return rows
      .filter((s) => s.expiresAt > new Date())
      .map((s) => ({ id: s.id, deviceName: s.deviceName, platform: s.platform, appVersion: s.appVersion, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, current: s.id === a.sessionId }));
  });

  app.delete('/me/sessions/:id', async (req, reply) => {
    const a = await requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    if (!(await auth.revokeSession(id, a.userId))) throw notFound();
    reply.status(204);
  });

  app.post('/me/sessions/revoke-others', async (req) => {
    const a = await requireAuth(req);
    await auth.revokeOtherSessions(a.userId, a.sessionId);
    return { ok: true };
  });

  app.put('/me/push-token', async (req) => {
    const a = await requireAuth(req);
    const b = parse(z.object({ token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/), platform: z.enum(['ios', 'android']) }).strict(), req.body);
    await deps.db
      .insert(pushTokens)
      .values({ token: b.token, userId: a.userId, sessionId: a.sessionId, platform: b.platform })
      .onConflictDoUpdate({ target: pushTokens.token, set: { userId: a.userId, sessionId: a.sessionId, platform: b.platform } });
    return { ok: true };
  });

  app.delete('/me/push-token', async (req, reply) => {
    const a = await requireAuth(req);
    await deps.db.delete(pushTokens).where(and(eq(pushTokens.userId, a.userId), eq(pushTokens.sessionId, a.sessionId)));
    reply.status(204);
  });

  app.get('/me/export', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = await requireAuth(req);
    reply.header('Content-Disposition', 'attachment; filename="pepperedapron-export.json"');
    return account.export(a.userId);
  });

  app.delete('/me', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = await requireAuth(req);
    const b = parse(z.object({ password: z.string().max(200).nullable(), confirm: z.literal('DELETE') }).strict(), req.body);
    await account.delete(a.userId, b.password);
    reply.status(204);
  });
}
