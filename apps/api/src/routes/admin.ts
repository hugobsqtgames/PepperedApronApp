import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CONTACT_STATUSES, REPORT_STATUSES } from '@pepperedapron/core';
import type { RouteCtx } from '../app';
import { parse } from '../lib/validate';
import { AdminService } from '../services/admin';

const page = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function adminRoutes(app: FastifyInstance, { deps, requireAdmin }: RouteCtx) {
  const admin = new AdminService(deps);
  app.get('/admin/stats', async (req) => {
    await requireAdmin(req);
    return admin.stats();
  });
  app.get('/admin/reports', async (req) => {
    await requireAdmin(req);
    const q = parse(page.extend({ status: z.enum(REPORT_STATUSES).optional() }), req.query);
    return { items: await admin.listReports(q.status, q.limit, q.offset) };
  });
  app.patch('/admin/reports/:id', async (req) => {
    const a = await requireAdmin(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const b = parse(
      z
        .object({
          status: z.enum(REPORT_STATUSES),
          action: z.enum(['none', 'unpublish', 'unpublish_and_block']).default('none'),
          resolution: z.string().max(500).nullish(),
        })
        .strict(),
      req.body,
    );
    await admin.handleReport(a.userId, id, b.status, b.action, b.resolution ?? null);
    return { ok: true };
  });
  app.get('/admin/recipes/:id', async (req) => {
    await requireAdmin(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    return admin.recipe(id);
  });
  app.get('/admin/users/:id', async (req) => {
    await requireAdmin(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    return admin.user(id);
  });
  app.patch('/admin/users/:id', async (req) => {
    await requireAdmin(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const b = parse(z.object({ canPublish: z.boolean() }).strict(), req.body);
    await admin.setCanPublish(id, b.canPublish);
    return admin.user(id);
  });
  app.get('/admin/messages', async (req) => {
    await requireAdmin(req);
    const q = parse(page.extend({ status: z.enum(CONTACT_STATUSES).optional() }), req.query);
    return { items: await admin.listMessages(q.status, q.limit, q.offset) };
  });
  app.patch('/admin/messages/:id', async (req) => {
    await requireAdmin(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const b = parse(z.object({ status: z.enum(CONTACT_STATUSES) }).strict(), req.body);
    await admin.setMessageStatus(id, b.status);
    return { ok: true };
  });
}
