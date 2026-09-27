import { and, desc, eq, sql } from 'drizzle-orm';
import type { AppDeps } from '../context';
import {
  analyticsEvents,
  contactMessages,
  favorites,
  mealPlanEntries,
  recipes,
  reports,
  shoppingLists,
  users,
} from '../db/schema';
import { notFound } from '../lib/errors';
import { nextVersion } from '../sync/version';
import { RecipeService } from './recipes';

const count = async (q: Promise<{ c: number }[]>) => Number((await q)[0]?.c ?? 0);

export class AdminService {
  constructor(private readonly d: AppDeps) {}

  /** Real numbers from the database — no estimates. */
  async stats() {
    const db = this.d.db;
    const c = sql<number>`count(*)::int`;
    const since = (days: number) => sql`now() - make_interval(days => ${days})`;
    const events = await db
      .select({ name: analyticsEvents.name, n: c })
      .from(analyticsEvents)
      .where(sql`${analyticsEvents.day} >= (now() - interval '30 days')::date`)
      .groupBy(analyticsEvents.name)
      .orderBy(desc(c));
    return {
      users: {
        total: await count(db.select({ c }).from(users)),
        new7d: await count(
          db
            .select({ c })
            .from(users)
            .where(sql`${users.createdAt} > ${since(7)}`),
        ),
        new30d: await count(
          db
            .select({ c })
            .from(users)
            .where(sql`${users.createdAt} > ${since(30)}`),
        ),
        active1d: await count(
          db
            .select({ c })
            .from(users)
            .where(sql`${users.lastSeenAt} > ${since(1)}`),
        ),
        active7d: await count(
          db
            .select({ c })
            .from(users)
            .where(sql`${users.lastSeenAt} > ${since(7)}`),
        ),
        active30d: await count(
          db
            .select({ c })
            .from(users)
            .where(sql`${users.lastSeenAt} > ${since(30)}`),
        ),
      },
      recipes: {
        total: await count(
          db
            .select({ c })
            .from(recipes)
            .where(sql`${recipes.deletedAt} is null`),
        ),
        public: await count(
          db
            .select({ c })
            .from(recipes)
            .where(sql`${recipes.deletedAt} is null and ${recipes.visibility} = 'public'`),
        ),
        created7d: await count(
          db
            .select({ c })
            .from(recipes)
            .where(sql`${recipes.createdAt} > ${since(7)}`),
        ),
      },
      favorites: await count(
        db
          .select({ c })
          .from(favorites)
          .where(sql`${favorites.deletedAt} is null`),
      ),
      mealPlanEntries30d: await count(
        db
          .select({ c })
          .from(mealPlanEntries)
          .where(sql`${mealPlanEntries.createdAt} > ${since(30)}`),
      ),
      shoppingLists: await count(
        db
          .select({ c })
          .from(shoppingLists)
          .where(sql`${shoppingLists.deletedAt} is null`),
      ),
      openReports: await count(db.select({ c }).from(reports).where(eq(reports.status, 'open'))),
      newMessages: await count(
        db.select({ c }).from(contactMessages).where(eq(contactMessages.status, 'new')),
      ),
      events30d: events,
    };
  }

  async listReports(status: string | undefined, limit: number, offset: number) {
    const rows = await this.d.db
      .select({
        id: reports.id,
        reason: reports.reason,
        details: reports.details,
        status: reports.status,
        resolution: reports.resolution,
        createdAt: reports.createdAt,
        handledAt: reports.handledAt,
        recipeId: recipes.id,
        recipeTitle: recipes.title,
        recipeVisibility: recipes.visibility,
        authorId: recipes.ownerId,
        reporterId: reports.reporterId,
      })
      .from(reports)
      .innerJoin(recipes, eq(recipes.id, reports.recipeId))
      .where(status ? eq(reports.status, status) : undefined)
      .orderBy(desc(reports.createdAt))
      .limit(limit)
      .offset(offset);
    return rows;
  }

  async handleReport(
    adminId: string,
    id: string,
    status: 'resolved' | 'dismissed' | 'open',
    action: 'none' | 'unpublish' | 'unpublish_and_block',
    resolution: string | null,
  ) {
    await this.d.db.transaction(async (tx) => {
      const r = await tx.query.reports.findFirst({ where: eq(reports.id, id) });
      if (!r) throw notFound();
      if (action !== 'none') {
        const rec = await tx.query.recipes.findFirst({ where: eq(recipes.id, r.recipeId) });
        if (rec && rec.visibility === 'public') {
          const version = await nextVersion(tx);
          await tx
            .update(recipes)
            .set({ visibility: 'private', publishedAt: null, version, updatedAt: new Date() })
            .where(eq(recipes.id, rec.id));
        }
        if (rec && action === 'unpublish_and_block')
          await tx.update(users).set({ canPublish: false }).where(eq(users.id, rec.ownerId));
        // Close every other open report on the same recipe.
        await tx
          .update(reports)
          .set({ status, handledBy: adminId, handledAt: new Date(), resolution })
          .where(and(eq(reports.recipeId, r.recipeId), eq(reports.status, 'open')));
      }
      await tx
        .update(reports)
        .set({ status, handledBy: adminId, handledAt: new Date(), resolution })
        .where(eq(reports.id, id));
    });
  }

  async recipe(id: string) {
    const row = await this.d.db.query.recipes.findFirst({ where: eq(recipes.id, id) });
    if (!row) throw notFound();
    return new RecipeService(this.d).full(this.d.db, row);
  }

  async user(id: string) {
    const u = await this.d.db.query.users.findFirst({ where: eq(users.id, id) });
    if (!u) throw notFound();
    const c = sql<number>`count(*)::int`;
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      emailVerified: !!u.emailVerifiedAt,
      role: u.role,
      canPublish: u.canPublish,
      createdAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
      recipeCount: await count(
        this.d.db
          .select({ c })
          .from(recipes)
          .where(and(eq(recipes.ownerId, id), sql`${recipes.deletedAt} is null`)),
      ),
      publicRecipeCount: await count(
        this.d.db
          .select({ c })
          .from(recipes)
          .where(
            and(
              eq(recipes.ownerId, id),
              eq(recipes.visibility, 'public'),
              sql`${recipes.deletedAt} is null`,
            ),
          ),
      ),
      reportsAgainst: await count(
        this.d.db
          .select({ c })
          .from(reports)
          .innerJoin(recipes, eq(recipes.id, reports.recipeId))
          .where(eq(recipes.ownerId, id)),
      ),
    };
  }

  async setCanPublish(id: string, canPublish: boolean) {
    await this.d.db.update(users).set({ canPublish }).where(eq(users.id, id));
  }

  async listMessages(status: string | undefined, limit: number, offset: number) {
    return this.d.db
      .select({
        id: contactMessages.id,
        email: contactMessages.email,
        subject: contactMessages.subject,
        message: contactMessages.message,
        status: contactMessages.status,
        createdAt: contactMessages.createdAt,
        userId: contactMessages.userId,
        displayName: users.displayName,
        platform: contactMessages.platform,
        appVersion: contactMessages.appVersion,
      })
      .from(contactMessages)
      .leftJoin(users, eq(users.id, contactMessages.userId))
      .where(status ? eq(contactMessages.status, status) : undefined)
      .orderBy(desc(contactMessages.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async setMessageStatus(id: string, status: string) {
    const r = await this.d.db
      .update(contactMessages)
      .set({ status })
      .where(eq(contactMessages.id, id))
      .returning({ id: contactMessages.id });
    if (!r.length) throw notFound();
  }
}
