import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LIMITS } from '@pepperedapron/core';
import type { RouteCtx } from '../app';
import { parse } from '../lib/validate';
import { HouseholdService } from '../services/households';

const name = z.string().trim().min(1).max(LIMITS.householdName);

export async function householdRoutes(app: FastifyInstance, { deps, requireAuth }: RouteCtx) {
  const hs = new HouseholdService(deps);

  app.get('/household', async (req) => {
    const a = await requireAuth(req);
    return { household: await hs.current(a.userId) };
  });
  app.post('/household', async (req, reply) => {
    const a = await requireAuth(req);
    const b = parse(z.object({ name }).strict(), req.body);
    reply.status(201);
    return { household: await hs.create(a.userId, b.name) };
  });
  app.patch('/household', async (req) => {
    const a = await requireAuth(req);
    const b = parse(z.object({ name }).strict(), req.body);
    return { household: await hs.rename(a.userId, b.name) };
  });
  app.post(
    '/household/invites',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const a = await requireAuth(req);
      reply.status(201);
      return hs.createInvite(a.userId);
    },
  );
  app.post(
    '/household/join',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req) => {
      const a = await requireAuth(req);
      const b = parse(z.object({ code: z.string().min(4).max(20) }).strict(), req.body);
      return { household: await hs.join(a.userId, b.code) };
    },
  );
  app.post('/household/leave', async (req) => {
    const a = await requireAuth(req);
    await hs.leave(a.userId);
    return { household: null };
  });
  app.delete('/household/members/:userId', async (req) => {
    const a = await requireAuth(req);
    const p = parse(z.object({ userId: z.uuid() }), req.params);
    await hs.kick(a.userId, p.userId);
    return { household: await hs.current(a.userId) };
  });
  app.delete('/household', async (req) => {
    const a = await requireAuth(req);
    await hs.dissolve(a.userId);
    return { household: null };
  });
}
