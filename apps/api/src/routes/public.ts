import type { FastifyInstance } from 'fastify';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { LIMITS, RECIPE_CATEGORIES, REPORT_REASONS } from '@pepperedapron/core';
import type { RouteCtx } from '../app';
import { recipes, reports, shareLinks, users } from '../db/schema';
import { randomToken } from '../lib/crypto';
import { conflict, forbidden, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { RecipeService } from '../services/recipes';
import { scopeOf, canAccess } from '../sync/scope';

export async function publicRoutes(app: FastifyInstance, { deps, requireAuth, optionalAuth }: RouteCtx) {
  const rs = new RecipeService(deps);
  const card = (r: typeof recipes.$inferSelect & { authorName: string | null }) => ({
    id: r.id,
    title: r.title,
    photoUrl: rs.photoUrl(r.photoKey),
    totalMinutes: r.totalMinutes ?? ([r.prepMinutes, r.cookMinutes, r.restMinutes].some((x) => x !== null) ? (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0) + (r.restMinutes ?? 0) : null),
    category: r.category,
    difficulty: r.difficulty,
    authorName: r.authorName ?? '',
    saveCount: r.saveCount,
    publishedAt: r.publishedAt?.toISOString() ?? null,
  });

  // ---------------------------------------------------------- public recipes
  app.get('/public/recipes', async (req) => {
    const q = parse(
      z.object({
        sort: z.enum(['recent', 'popular']).default('recent'),
        category: z.enum(RECIPE_CATEGORIES).optional(),
        q: z.string().trim().max(100).optional(),
        authorId: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        offset: z.coerce.number().int().min(0).max(1000).default(0),
      }),
      req.query,
    );
    const esc = q.q?.replace(/[\\%_]/g, (c) => `\\${c}`);
    const rows = await deps.db
      .select({ r: recipes, authorName: users.displayName })
      .from(recipes)
      .innerJoin(users, eq(users.id, recipes.ownerId))
      .where(
        and(
          eq(recipes.visibility, 'public'),
          isNull(recipes.deletedAt),
          q.category ? eq(recipes.category, q.category) : undefined,
          q.authorId ? eq(recipes.ownerId, q.authorId) : undefined,
          esc ? or(ilike(recipes.title, `%${esc}%`), sql`${esc.toLowerCase()} = any(${recipes.tags})`) : undefined,
          q.sort === 'popular' ? sql`${recipes.publishedAt} > now() - interval '180 days'` : undefined,
        ),
      )
      .orderBy(q.sort === 'popular' ? desc(recipes.saveCount) : desc(recipes.publishedAt), desc(recipes.id))
      .limit(q.limit)
      .offset(q.offset);
    return { items: rows.map((x) => card({ ...x.r, authorName: x.authorName })) };
  });

  app.get('/public/recipes/:id', async (req) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const row = await rs.getLive(deps.db, id);
    if (!row || row.visibility !== 'public') throw notFound('recipe_not_found');
    return rs.full(deps.db, row);
  });

  app.post('/public/recipes/:id/save', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = await requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const row = await rs.getLive(deps.db, id);
    if (!row || row.visibility !== 'public') throw notFound('recipe_not_found');
    reply.status(201);
    return { record: await rs.copyToLibrary(id, a.userId) };
  });

  app.post('/public/recipes/:id/report', { config: { rateLimit: { max: 20, timeWindow: '1 day' } } }, async (req, reply) => {
    const a = await requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const b = parse(z.object({ reason: z.enum(REPORT_REASONS), details: z.string().trim().max(LIMITS.reportDetails).nullish() }).strict(), req.body);
    const row = await rs.getLive(deps.db, id);
    if (!row || row.visibility !== 'public') throw notFound('recipe_not_found');
    if (row.ownerId === a.userId) throw forbidden('cannot_report_own');
    const r = await deps.db.insert(reports).values({ recipeId: id, reporterId: a.userId, reason: b.reason, details: b.details ?? null }).onConflictDoNothing().returning({ id: reports.id });
    if (!r.length) throw conflict('already_reported');
    reply.status(201);
    return { ok: true };
  });

  app.get('/public/users/:id', async (req) => {
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const u = await deps.db.query.users.findFirst({ where: eq(users.id, id), columns: { id: true, displayName: true, avatarKey: true, createdAt: true } });
    if (!u) throw notFound();
    const count = await deps.db.select({ c: sql<number>`count(*)::int` }).from(recipes).where(and(eq(recipes.ownerId, id), eq(recipes.visibility, 'public'), isNull(recipes.deletedAt)));
    return { id: u.id, displayName: u.displayName, avatarUrl: rs.photoUrl(u.avatarKey), memberSince: u.createdAt.toISOString(), publicRecipeCount: count[0]?.c ?? 0 };
  });

  // ---------------------------------------------------------- share links
  app.post('/recipes/:id/share', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req) => {
    const a = await requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const row = await rs.getLive(deps.db, id);
    if (!row || !canAccess(await scopeOf(deps.db, a.userId), row)) throw notFound('recipe_not_found');
    const existing = await deps.db.query.shareLinks.findFirst({ where: and(eq(shareLinks.recipeId, id), eq(shareLinks.createdBy, a.userId), isNull(shareLinks.revokedAt)) });
    const token = existing?.token ?? randomToken(18);
    if (!existing) await deps.db.insert(shareLinks).values({ token, recipeId: id, createdBy: a.userId });
    return { token, url: `${deps.env.WEB_PUBLIC_URL.replace(/\/+$/, '')}/r/${token}` };
  });

  app.delete('/recipes/:id/share', async (req, reply) => {
    const a = await requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const row = await rs.getLive(deps.db, id);
    if (!row || !canAccess(await scopeOf(deps.db, a.userId), row)) throw notFound('recipe_not_found');
    await deps.db.update(shareLinks).set({ revokedAt: new Date() }).where(and(eq(shareLinks.recipeId, id), isNull(shareLinks.revokedAt)));
    reply.status(204);
  });

  const resolveShare = async (token: string) => {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw notFound('share_not_found');
    const link = await deps.db.query.shareLinks.findFirst({ where: and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)) });
    if (!link) throw notFound('share_not_found');
    const row = await rs.getLive(deps.db, link.recipeId);
    if (!row) throw notFound('recipe_not_found');
    return row;
  };
  app.get('/share/:token', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const { token } = parse(z.object({ token: z.string().max(80) }), req.params);
    const row = await resolveShare(token);
    const viewer = await optionalAuth(req);
    const full = await rs.full(deps.db, row);
    return { ...full, isMine: viewer ? canAccess(await scopeOf(deps.db, viewer.userId), row) : false };
  });
  app.post('/share/:token/save', { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, async (req, reply) => {
    const a = await requireAuth(req);
    const { token } = parse(z.object({ token: z.string().max(80) }), req.params);
    const row = await resolveShare(token);
    reply.status(201);
    return { record: await rs.copyToLibrary(row.id, a.userId) };
  });
}
