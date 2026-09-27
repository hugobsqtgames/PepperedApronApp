import { and, eq, isNull, sql } from 'drizzle-orm';
import { DEFAULT_SETTINGS, type Locale, LOCALES } from '@pepperedapron/core';
import type { AppDeps } from '../context';
import type { Tx } from '../db';
import { authIdentities, emailTokens, sessions, userSettings, users } from '../db/schema';
import { list } from '../env';
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/crypto';
import { AppError, badRequest, conflict, unauthorized } from '../lib/errors';
import { buildMail } from '../services/mailer';
import type { OAuthInput, OAuthProvider } from '../services/oauth';
import { nextVersion } from '../sync/version';
import { signAccessToken } from './tokens';

export interface DeviceInfo {
  deviceName?: string | null;
  platform?: string | null;
  appVersion?: string | null;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: PublicUser;
  isNewUser: boolean;
}

export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarKey: string | null;
  role: 'user' | 'admin';
  locale: string;
  hasPassword: boolean;
  providers: string[];
  createdAt: string;
}

const EMAIL_TTL_H = { verify_email: 48, change_email: 48, reset_password: 1 } as const;

export class AuthService {
  constructor(private readonly d: AppDeps) {}
  private now() {
    return this.d.now?.() ?? new Date();
  }

  async publicUser(userId: string): Promise<PublicUser> {
    const u = await this.d.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!u) throw unauthorized('invalid_token');
    const ids = await this.d.db.select({ provider: authIdentities.provider }).from(authIdentities).where(eq(authIdentities.userId, userId));
    return {
      id: u.id,
      email: u.email,
      emailVerified: !!u.emailVerifiedAt,
      displayName: u.displayName,
      avatarKey: u.avatarKey,
      role: u.role as 'user' | 'admin',
      locale: u.locale,
      hasPassword: !!u.passwordHash,
      providers: ids.map((i) => i.provider),
      createdAt: u.createdAt.toISOString(),
    };
  }

  private normLocale(l: string | null | undefined): Locale {
    return (LOCALES as readonly string[]).includes(l ?? '') ? (l as Locale) : 'en';
  }

  /** New account: user row + default settings (synced entity). */
  private async createUser(tx: Tx, p: { email: string; passwordHash: string | null; displayName: string; locale: string; verified: boolean }) {
    const role = list(this.d.env.ADMIN_EMAILS).map((e) => e.toLowerCase()).includes(p.email.toLowerCase()) && p.verified ? 'admin' : 'user';
    const [u] = await tx
      .insert(users)
      .values({ email: p.email, passwordHash: p.passwordHash, displayName: p.displayName, locale: this.normLocale(p.locale), emailVerifiedAt: p.verified ? this.now() : null, role })
      .returning();
    const version = await nextVersion(tx);
    await tx.insert(userSettings).values({ id: u!.id, ownerId: u!.id, version, data: { ...DEFAULT_SETTINGS, locale: this.normLocale(p.locale) } });
    return u!;
  }

  async register(p: { email: string; password: string; displayName: string; locale: string }, device: DeviceInfo): Promise<AuthResult> {
    const existing = await this.d.db.query.users.findFirst({ where: sql`lower(${users.email}) = ${p.email.toLowerCase()}` });
    if (existing) throw conflict('email_in_use');
    const passwordHash = await hashPassword(p.password);
    let userId: string;
    try {
      userId = await this.d.db.transaction(async (tx) => (await this.createUser(tx, { ...p, passwordHash, verified: false })).id);
    } catch (e) {
      if ((e as { code?: string }).code === '23505' || (e as { cause?: { code?: string } }).cause?.code === '23505') throw conflict('email_in_use');
      throw e;
    }
    await this.sendEmailToken(userId, 'verify_email', p.email, p.locale);
    return this.issueSession(userId, device, true);
  }

  async login(p: { email: string; password: string }, device: DeviceInfo): Promise<AuthResult> {
    const u = await this.d.db.query.users.findFirst({ where: sql`lower(${users.email}) = ${p.email.toLowerCase()}` });
    const ok = await verifyPassword(p.password, u?.passwordHash ?? null);
    if (!u || !ok) throw unauthorized('invalid_credentials');
    return this.issueSession(u.id, device, false);
  }

  async issueSession(userId: string, device: DeviceInfo, isNewUser: boolean): Promise<AuthResult> {
    const refreshToken = randomToken(32);
    const expiresAt = new Date(this.now().getTime() + this.d.env.REFRESH_TOKEN_TTL_DAYS * 86400_000);
    const [s] = await this.d.db
      .insert(sessions)
      .values({
        userId,
        refreshHash: sha256(refreshToken),
        deviceName: device.deviceName?.slice(0, 80) ?? null,
        platform: device.platform?.slice(0, 20) ?? null,
        appVersion: device.appVersion?.slice(0, 20) ?? null,
        expiresAt,
      })
      .returning();
    await this.d.db.update(users).set({ lastSeenAt: this.now() }).where(eq(users.id, userId));
    const user = await this.publicUser(userId);
    const accessToken = await signAccessToken(this.d.env, { userId, sessionId: s!.id, role: user.role });
    return { accessToken, refreshToken, expiresIn: this.d.env.ACCESS_TOKEN_TTL_SECONDS, user, isNewUser };
  }

  /** Rotating refresh tokens with reuse detection (a replayed old token revokes the session). */
  async refresh(refreshToken: string, device: DeviceInfo): Promise<Omit<AuthResult, 'isNewUser'>> {
    const h = sha256(refreshToken);
    const now = this.now();
    const s = await this.d.db.query.sessions.findFirst({ where: eq(sessions.refreshHash, h) });
    if (!s) {
      const reused = await this.d.db.query.sessions.findFirst({ where: eq(sessions.previousHash, h) });
      if (reused && !reused.revokedAt) {
        await this.d.db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, reused.id));
      }
      throw unauthorized('invalid_refresh_token');
    }
    if (s.revokedAt || s.expiresAt < now) throw unauthorized('session_expired');
    const next = randomToken(32);
    const updated = await this.d.db
      .update(sessions)
      .set({
        refreshHash: sha256(next),
        previousHash: h,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + this.d.env.REFRESH_TOKEN_TTL_DAYS * 86400_000),
        appVersion: device.appVersion?.slice(0, 20) ?? s.appVersion,
      })
      .where(and(eq(sessions.id, s.id), eq(sessions.refreshHash, h)))
      .returning({ id: sessions.id });
    // Concurrent refresh with the same token: only one wins.
    if (!updated.length) throw unauthorized('invalid_refresh_token');
    const user = await this.publicUser(s.userId);
    await this.d.db.update(users).set({ lastSeenAt: now }).where(eq(users.id, s.userId));
    const accessToken = await signAccessToken(this.d.env, { userId: s.userId, sessionId: s.id, role: user.role });
    return { accessToken, refreshToken: next, expiresIn: this.d.env.ACCESS_TOKEN_TTL_SECONDS, user };
  }

  async revokeSession(sessionId: string, userId: string) {
    const r = await this.d.db
      .update(sessions)
      .set({ revokedAt: this.now() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return r.length > 0;
  }

  async revokeOtherSessions(userId: string, keepSessionId: string | null) {
    await this.d.db
      .update(sessions)
      .set({ revokedAt: this.now() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), keepSessionId ? sql`${sessions.id} <> ${keepSessionId}` : sql`true`));
  }

  // ------------------------------------------------------------ e-mail tokens
  async sendEmailToken(userId: string, kind: 'verify_email' | 'reset_password' | 'change_email', to: string, locale: string, newEmail?: string) {
    const token = randomToken(32);
    await this.d.db
      .update(emailTokens)
      .set({ usedAt: this.now() })
      .where(and(eq(emailTokens.userId, userId), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt)));
    await this.d.db.insert(emailTokens).values({
      userId,
      kind,
      tokenHash: sha256(token),
      newEmail: newEmail ?? null,
      expiresAt: new Date(this.now().getTime() + EMAIL_TTL_H[kind] * 3600_000),
    });
    const base = this.d.env.WEB_PUBLIC_URL.replace(/\/+$/, '');
    const path = kind === 'reset_password' ? 'reset-password' : kind === 'change_email' ? 'confirm-email' : 'verify-email';
    const link = `${base}/auth/${path}?token=${encodeURIComponent(token)}`;
    try {
      await this.d.mailer.send(buildMail(kind, locale, to, link));
    } catch (e) {
      console.error('[mail] send failed', (e as Error).message);
    }
  }

  private async consumeToken(token: string, kind: string) {
    const now = this.now();
    const [row] = await this.d.db
      .update(emailTokens)
      .set({ usedAt: now })
      .where(and(eq(emailTokens.tokenHash, sha256(token)), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt), sql`${emailTokens.expiresAt} > ${now}`))
      .returning();
    if (!row) throw badRequest('invalid_or_expired_token');
    return row;
  }

  async verifyEmail(token: string) {
    const row = await this.consumeToken(token, 'verify_email');
    await this.d.db.update(users).set({ emailVerifiedAt: this.now(), updatedAt: this.now() }).where(eq(users.id, row.userId));
    await this.maybePromoteAdmin(row.userId);
  }

  async resendVerification(userId: string) {
    const u = await this.d.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!u || u.emailVerifiedAt) return;
    await this.sendEmailToken(u.id, 'verify_email', u.email, u.locale);
  }

  async forgotPassword(email: string) {
    const u = await this.d.db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email.toLowerCase()}` });
    // Same response whether or not the account exists (no user enumeration).
    if (u) await this.sendEmailToken(u.id, 'reset_password', u.email, u.locale);
  }

  async resetPassword(token: string, password: string) {
    const row = await this.consumeToken(token, 'reset_password');
    await this.d.db
      .update(users)
      .set({ passwordHash: await hashPassword(password), emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`, updatedAt: this.now() })
      .where(eq(users.id, row.userId));
    await this.revokeOtherSessions(row.userId, null);
  }

  async changePassword(userId: string, sessionId: string, current: string | null, next: string) {
    const u = await this.d.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!u) throw unauthorized();
    if (u.passwordHash && !(await verifyPassword(current ?? '', u.passwordHash))) throw new AppError(403, 'invalid_credentials');
    await this.d.db.update(users).set({ passwordHash: await hashPassword(next), updatedAt: this.now() }).where(eq(users.id, userId));
    await this.revokeOtherSessions(userId, sessionId);
  }

  async requestEmailChange(userId: string, newEmail: string, password: string | null) {
    const u = await this.d.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!u) throw unauthorized();
    if (u.passwordHash && !(await verifyPassword(password ?? '', u.passwordHash))) throw new AppError(403, 'invalid_credentials');
    const taken = await this.d.db.query.users.findFirst({ where: sql`lower(${users.email}) = ${newEmail.toLowerCase()}` });
    if (taken) throw conflict('email_in_use');
    await this.sendEmailToken(userId, 'change_email', newEmail, u.locale, newEmail);
  }

  async confirmEmailChange(token: string) {
    const row = await this.consumeToken(token, 'change_email');
    try {
      await this.d.db.update(users).set({ email: row.newEmail!, emailVerifiedAt: this.now(), updatedAt: this.now() }).where(eq(users.id, row.userId));
    } catch {
      throw conflict('email_in_use');
    }
  }

  private async maybePromoteAdmin(userId: string) {
    const admins = list(this.d.env.ADMIN_EMAILS).map((e) => e.toLowerCase());
    if (!admins.length) return;
    const u = await this.d.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (u && u.emailVerifiedAt && admins.includes(u.email.toLowerCase()) && u.role !== 'admin') {
      await this.d.db.update(users).set({ role: 'admin' }).where(eq(users.id, userId));
    }
  }

  // ------------------------------------------------------------ OAuth
  async oauth(provider: OAuthProvider, input: OAuthInput & { locale?: string }, device: DeviceInfo): Promise<AuthResult> {
    const profile = await this.d.oauth.verify(provider, input);
    const identity = await this.d.db.query.authIdentities.findFirst({
      where: and(eq(authIdentities.provider, provider), eq(authIdentities.subject, profile.subject)),
    });
    if (identity) return this.issueSession(identity.userId, device, false);

    const email = profile.email?.toLowerCase() ?? null;
    if (email) {
      const existing = await this.d.db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
      if (existing) {
        // Only link when both the provider and our account have verified the address.
        if (!profile.emailVerified || !existing.emailVerifiedAt) throw conflict('email_in_use_sign_in_with_password');
        await this.d.db.insert(authIdentities).values({ userId: existing.id, provider, subject: profile.subject, email });
        return this.issueSession(existing.id, device, false);
      }
    }
    // Apple may hide the e-mail; Facebook may omit it. Use a private relay-style placeholder.
    const finalEmail = email ?? `${provider}-${sha256(profile.subject).slice(0, 16)}@users.pepperedapron.invalid`;
    const displayName = (profile.name ?? input.name ?? email?.split('@')[0] ?? 'Chef').slice(0, 80);
    const userId = await this.d.db.transaction(async (tx) => {
      const u = await this.createUser(tx, { email: finalEmail, passwordHash: null, displayName, locale: input.locale ?? 'en', verified: profile.emailVerified });
      await tx.insert(authIdentities).values({ userId: u.id, provider, subject: profile.subject, email });
      return u.id;
    });
    return this.issueSession(userId, device, true);
  }
}
