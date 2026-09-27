import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { AppDeps } from '../context';
import type { Tx } from '../db';
import { householdInvites, householdMembers, households, pushTokens, users } from '../db/schema';
import { inviteCode } from '../lib/crypto';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { TABLES } from '../sync/entities';
import { bumpScopeEpoch } from '../sync/scope';
import { nextVersion } from '../sync/version';

const INVITE_TTL_DAYS = 7;

export interface HouseholdView {
  id: string;
  name: string;
  myRole: 'owner' | 'member';
  members: { userId: string; displayName: string; role: 'owner' | 'member'; joinedAt: string }[];
}

export class HouseholdService {
  constructor(private readonly d: AppDeps) {}

  private async membership(db: Tx | AppDeps['db'], userId: string) {
    const m = await db.query.householdMembers.findFirst({ where: eq(householdMembers.userId, userId) });
    return m ?? null;
  }

  async current(userId: string): Promise<HouseholdView | null> {
    const m = await this.membership(this.d.db, userId);
    if (!m) return null;
    const h = await this.d.db.query.households.findFirst({ where: eq(households.id, m.householdId) });
    const members = await this.d.db
      .select({ userId: householdMembers.userId, role: householdMembers.role, joinedAt: householdMembers.joinedAt, displayName: users.displayName })
      .from(householdMembers)
      .innerJoin(users, eq(users.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, m.householdId))
      .orderBy(asc(householdMembers.joinedAt));
    return {
      id: h!.id,
      name: h!.name,
      myRole: m.role as 'owner' | 'member',
      members: members.map((x) => ({ userId: x.userId, displayName: x.displayName, role: x.role as 'owner' | 'member', joinedAt: x.joinedAt.toISOString() })),
    };
  }

  async create(userId: string, name: string): Promise<HouseholdView> {
    await this.d.db.transaction(async (tx) => {
      if (await this.membership(tx, userId)) throw conflict('already_in_household');
      const [h] = await tx.insert(households).values({ name, createdBy: userId }).returning();
      await tx.insert(householdMembers).values({ householdId: h!.id, userId, role: 'owner' });
      await bumpScopeEpoch(tx, [userId]);
    });
    return (await this.current(userId))!;
  }

  async rename(userId: string, name: string): Promise<HouseholdView> {
    const m = await this.membership(this.d.db, userId);
    if (!m) throw notFound('no_household');
    if (m.role !== 'owner') throw forbidden('owner_only');
    await this.d.db.update(households).set({ name, updatedAt: new Date() }).where(eq(households.id, m.householdId));
    return (await this.current(userId))!;
  }

  async createInvite(userId: string): Promise<{ code: string; expiresAt: string; url: string }> {
    const m = await this.membership(this.d.db, userId);
    if (!m) throw notFound('no_household');
    const code = inviteCode(8);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000);
    await this.d.db.insert(householdInvites).values({ householdId: m.householdId, code, createdBy: userId, expiresAt });
    return { code, expiresAt: expiresAt.toISOString(), url: `${this.d.env.WEB_PUBLIC_URL.replace(/\/+$/, '')}/join/${code}` };
  }

  async join(userId: string, rawCode: string): Promise<HouseholdView> {
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const joined = await this.d.db.transaction(async (tx) => {
      if (await this.membership(tx, userId)) throw conflict('already_in_household');
      const inv = await tx.query.householdInvites.findFirst({
        where: and(eq(householdInvites.code, code), isNull(householdInvites.revokedAt), sql`${householdInvites.expiresAt} > now()`, sql`${householdInvites.uses} < ${householdInvites.maxUses}`),
      });
      if (!inv) throw badRequest('invalid_invite');
      await tx.update(householdInvites).set({ uses: sql`${householdInvites.uses} + 1` }).where(eq(householdInvites.id, inv.id));
      await tx.insert(householdMembers).values({ householdId: inv.householdId, userId, role: 'member' });
      await bumpScopeEpoch(tx, [userId]);
      return inv.householdId;
    });
    await this.notifyMembers(joined, userId, 'joined');
    return (await this.current(userId))!;
  }

  /** Rows the user shared with a household stop being shared when they leave. */
  private async unshareUserRows(tx: Tx, userId: string, householdId: string) {
    for (const table of Object.values(TABLES)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = table as any;
      const rows = await tx.select({ id: t.id }).from(t).where(and(eq(t.ownerId, userId), eq(t.householdId, householdId)));
      if (!rows.length) continue;
      const version = await nextVersion(tx);
      await tx.update(t).set({ householdId: null, version, updatedAt: new Date() }).where(and(eq(t.ownerId, userId), eq(t.householdId, householdId)));
    }
  }

  async leave(userId: string): Promise<void> {
    await this.d.db.transaction(async (tx) => {
      const m = await this.membership(tx, userId);
      if (!m) throw notFound('no_household');
      await this.removeMember(tx, m.householdId, userId, m.role === 'owner');
    });
  }

  private async removeMember(tx: Tx, householdId: string, userId: string, wasOwner: boolean) {
    const others = await tx
      .select({ userId: householdMembers.userId })
      .from(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), sql`${householdMembers.userId} <> ${userId}`))
      .orderBy(asc(householdMembers.joinedAt));
    await this.unshareUserRows(tx, userId, householdId);
    await tx.delete(householdMembers).where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));
    if (!others.length) {
      await tx.delete(households).where(eq(households.id, householdId));
    } else if (wasOwner) {
      await tx.update(householdMembers).set({ role: 'owner' }).where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, others[0]!.userId)));
    }
    await bumpScopeEpoch(tx, [userId, ...others.map((o) => o.userId)]);
  }

  async kick(ownerId: string, memberId: string): Promise<void> {
    if (ownerId === memberId) throw badRequest('use_leave');
    await this.d.db.transaction(async (tx) => {
      const m = await this.membership(tx, ownerId);
      if (!m || m.role !== 'owner') throw forbidden('owner_only');
      const target = await this.membership(tx, memberId);
      if (!target || target.householdId !== m.householdId) throw notFound('member_not_found');
      await this.removeMember(tx, m.householdId, memberId, false);
    });
  }

  /** Delete the household: every member keeps their own data, nothing is shared anymore. */
  async dissolve(ownerId: string): Promise<void> {
    await this.d.db.transaction(async (tx) => {
      const m = await this.membership(tx, ownerId);
      if (!m || m.role !== 'owner') throw forbidden('owner_only');
      const members = await tx.select({ userId: householdMembers.userId }).from(householdMembers).where(eq(householdMembers.householdId, m.householdId));
      for (const mem of members) await this.unshareUserRows(tx, mem.userId, m.householdId);
      await tx.delete(households).where(eq(households.id, m.householdId));
      await bumpScopeEpoch(tx, members.map((x) => x.userId));
    });
  }

  private async notifyMembers(householdId: string, actorId: string, _event: 'joined') {
    const actor = await this.d.db.query.users.findFirst({ where: eq(users.id, actorId), columns: { displayName: true } });
    const tokens = await this.d.db
      .select({ token: pushTokens.token, locale: users.locale })
      .from(pushTokens)
      .innerJoin(householdMembers, eq(householdMembers.userId, pushTokens.userId))
      .innerJoin(users, eq(users.id, pushTokens.userId))
      .where(and(eq(householdMembers.householdId, householdId), sql`${pushTokens.userId} <> ${actorId}`));
    const body: Record<string, string> = {
      fr: `${actor?.displayName} a rejoint votre foyer`,
      en: `${actor?.displayName} joined your household`,
      es: `${actor?.displayName} se ha unido a tu hogar`,
      de: `${actor?.displayName} ist deinem Haushalt beigetreten`,
      it: `${actor?.displayName} si è unito alla tua famiglia`,
    };
    if (!tokens.length) return;
    try {
      await this.d.push.send(tokens.map((t) => ({ to: t.token, title: 'PepperedApron', body: body[t.locale] ?? body.en!, data: { type: 'household' } })));
    } catch (e) {
      console.error('[push] household notification failed', (e as Error).message);
    }
  }
}
