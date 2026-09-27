import { and, eq, isNull, sql } from 'drizzle-orm';
import type { AppDeps } from '../context';
import {
  analyticsEvents,
  contactMessages,
  deletedObjects,
  householdMembers,
  recipes,
  reports,
  sessions,
  uploads,
  users,
} from '../db/schema';
import { verifyPassword } from '../lib/crypto';
import { AppError, notFound } from '../lib/errors';
import { TABLES } from '../sync/entities';
import { loadChildren } from '../sync/recipes';
import { HouseholdService } from './households';

export class AccountService {
  constructor(private readonly d: AppDeps) {}

  /** RGPD data export (article 20): everything we hold about the user, as JSON. */
  async export(userId: string): Promise<Record<string, unknown>> {
    const db = this.d.db;
    const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!u) throw notFound();
    const out: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      format: 'pepperedapron-export/1',
      profile: {
        id: u.id,
        email: u.email,
        emailVerified: !!u.emailVerifiedAt,
        displayName: u.displayName,
        locale: u.locale,
        createdAt: u.createdAt,
        lastSeenAt: u.lastSeenAt,
      },
    };
    for (const [entity, table] of Object.entries(TABLES)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = table as any;
      const rows = (await db
        .select()
        .from(t)
        .where(and(eq(t.ownerId, userId), isNull(t.deletedAt)))) as Record<string, unknown>[];
      if (entity === 'recipe') {
        const kids = await loadChildren(
          db,
          rows.map((r) => String(r.id)),
        );
        out.recipes = rows.map((r) => ({
          ...r,
          photoUrl: r.photoKey ? `${this.d.storage.publicBaseUrl()}/${r.photoKey}` : null,
          ingredients: kids.get(String(r.id))?.ingredients ?? [],
          steps: kids.get(String(r.id))?.steps ?? [],
        }));
      } else {
        out[`${entity}s`] = rows;
      }
    }
    out.sessions = (await db.select().from(sessions).where(eq(sessions.userId, userId))).map(
      (s) => ({
        id: s.id,
        deviceName: s.deviceName,
        platform: s.platform,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        revokedAt: s.revokedAt,
      }),
    );
    out.contactMessages = await db
      .select()
      .from(contactMessages)
      .where(eq(contactMessages.userId, userId));
    out.reports = await db
      .select({
        id: reports.id,
        recipeId: reports.recipeId,
        reason: reports.reason,
        details: reports.details,
        status: reports.status,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.reporterId, userId));
    out.analyticsEvents = await db
      .select({
        name: analyticsEvents.name,
        day: analyticsEvents.day,
        platform: analyticsEvents.platform,
      })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.userId, userId));
    out.household = await new HouseholdService(this.d).current(userId);
    return out;
  }

  /** Permanent deletion (article 17). Requires the password for password accounts. */
  async delete(userId: string, password: string | null): Promise<void> {
    const u = await this.d.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!u) throw notFound();
    if (u.passwordHash && !(await verifyPassword(password ?? '', u.passwordHash)))
      throw new AppError(403, 'invalid_credentials');

    const inHousehold = await this.d.db.query.householdMembers.findFirst({
      where: eq(householdMembers.userId, userId),
    });
    if (inHousehold) await new HouseholdService(this.d).leave(userId);

    await this.d.db.transaction(async (tx) => {
      const keys = new Set<string>();
      const photos = await tx
        .select({ k: recipes.photoKey })
        .from(recipes)
        .where(and(eq(recipes.ownerId, userId), sql`${recipes.photoKey} is not null`));
      photos.forEach((p) => p.k && keys.add(p.k));
      const ups = await tx
        .select({ k: uploads.key })
        .from(uploads)
        .where(eq(uploads.ownerId, userId));
      ups.forEach((p) => keys.add(p.k));
      if (u.avatarKey) keys.add(u.avatarKey);
      if (keys.size)
        await tx
          .insert(deletedObjects)
          .values([...keys].map((key) => ({ key })))
          .onConflictDoNothing();
      // Cascades remove sessions, identities, tokens, all synced rows, uploads, share links.
      await tx.delete(users).where(eq(users.id, userId));
    });
  }

  /** Background job: delete queued storage objects and stale unconfirmed uploads. */
  async purgeObjects(limit = 100): Promise<number> {
    const stale = await this.d.db
      .delete(uploads)
      .where(
        and(eq(uploads.status, 'pending'), sql`${uploads.createdAt} < now() - interval '1 day'`),
      )
      .returning({ key: uploads.key });
    if (stale.length)
      await this.d.db
        .insert(deletedObjects)
        .values(stale.map((s) => ({ key: s.key })))
        .onConflictDoNothing();
    const batch = await this.d.db
      .select()
      .from(deletedObjects)
      .where(sql`${deletedObjects.attempts} < 10`)
      .limit(limit);
    let n = 0;
    for (const o of batch) {
      // A key may have been reused meanwhile (never for new uploads, but be safe).
      const inUse = await this.d.db
        .select({ id: recipes.id })
        .from(recipes)
        .where(and(eq(recipes.photoKey, o.key), isNull(recipes.deletedAt)))
        .limit(1);
      try {
        if (!inUse.length) await this.d.storage.delete(o.key);
        await this.d.db.delete(deletedObjects).where(eq(deletedObjects.key, o.key));
        if (!inUse.length) await this.d.db.delete(uploads).where(eq(uploads.key, o.key));
        n++;
      } catch {
        await this.d.db
          .update(deletedObjects)
          .set({ attempts: sql`${deletedObjects.attempts} + 1` })
          .where(eq(deletedObjects.key, o.key));
      }
    }
    return n;
  }

  /** Background job: hard-delete tombstones older than 90 days (clients sync within that window). */
  async purgeTombstones(days = 90): Promise<void> {
    for (const table of Object.values(TABLES)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = table as any;
      await this.d.db.delete(t).where(sql`${t.deletedAt} < now() - make_interval(days => ${days})`);
    }
    await this.d.db.execute(
      sql`DELETE FROM sync_ops WHERE created_at < now() - interval '30 days'`,
    );
    await this.d.db.delete(sessions).where(sql`${sessions.expiresAt} < now() - interval '30 days'`);
  }
}
