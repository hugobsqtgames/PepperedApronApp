import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pushRequestSchema } from '@pepperedapron/core';
import type { RouteCtx } from '../app';
import { parse } from '../lib/validate';
import { SyncService } from '../sync/service';

export async function syncRoutes(app: FastifyInstance, { deps, requireAuth }: RouteCtx) {
  const sync = new SyncService(deps);

  app.post('/sync/push', { bodyLimit: 4 * 1024 * 1024, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const a = await requireAuth(req);
    const b = parse(pushRequestSchema, req.body);
    return sync.push(a.userId, b.ops);
  });

  app.get('/sync/pull', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const a = await requireAuth(req);
    const q = parse(z.object({ cursor: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(1000).default(500) }), req.query);
    return sync.pull(a.userId, q.cursor, q.limit);
  });
}
