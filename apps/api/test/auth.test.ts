import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import {
  createTestApp,
  lastLinkTo,
  register,
  sha256hex,
  signIdToken,
  tokenFromLink,
  uniqueEmail,
  verify,
  type TestCtx,
} from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());

const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  ctx.app.inject({ method: 'POST', url, payload: payload as never, headers });

describe('email + password', () => {
  it('registers, returns tokens, sends a verification email, creates default settings', async () => {
    const c = await register(ctx);
    const me = await c.req('GET', '/v1/me');
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      email: c.email,
      emailVerified: false,
      displayName: 'Julie',
      hasPassword: true,
      role: 'user',
    });
    expect(me.json()).not.toHaveProperty('passwordHash');
    expect(lastLinkTo(ctx, c.email)).toMatch(/\/auth\/verify-email\?token=/);
    const pulled = await c.req('GET', '/v1/sync/pull?cursor=0');
    expect(
      pulled.json().records.find((r: { entity: string }) => r.entity === 'settings').data,
    ).toMatchObject({ locale: 'fr', theme: 'system' });
  });

  it('rejects duplicate emails case-insensitively', async () => {
    const email = uniqueEmail();
    await register(ctx, 'A', email);
    const r = await post('/v1/auth/register', {
      email: email.toUpperCase(),
      password: 'correct horse battery',
      displayName: 'B',
      locale: 'fr',
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('email_in_use');
  });

  it('validates input and never leaks technical errors', async () => {
    for (const payload of [
      { email: 'not-an-email', password: 'correct horse battery', displayName: 'A' },
      { email: uniqueEmail(), password: 'short', displayName: 'A' },
      { email: uniqueEmail(), password: 'correct horse battery', displayName: '' },
      { email: uniqueEmail(), password: 'correct horse battery', displayName: 'A', role: 'admin' },
      'garbage',
      null,
    ]) {
      const r = await post('/v1/auth/register', payload);
      expect([400, 415]).toContain(r.statusCode);
      expect(r.json().error.code).toMatch(/validation_error|bad_request|unsupported_media_type/);
      expect(r.body).not.toMatch(/stack|at \w+ \(/);
    }
  });

  it('logs in; wrong password and unknown email give the same error', async () => {
    const c = await register(ctx);
    expect(
      (await post('/v1/auth/login', { email: c.email, password: 'correct horse battery' }))
        .statusCode,
    ).toBe(200);
    const wrong = await post('/v1/auth/login', { email: c.email, password: 'nope nope nope' });
    const unknown = await post('/v1/auth/login', {
      email: uniqueEmail(),
      password: 'nope nope nope',
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it('rotates refresh tokens and revokes the session when an old token is replayed', async () => {
    const c = await register(ctx);
    const r1 = await post('/v1/auth/refresh', { refreshToken: c.refreshToken });
    expect(r1.statusCode).toBe(200);
    const next = r1.json().refreshToken;
    expect(next).not.toBe(c.refreshToken);
    // Replay of the old token = theft: session revoked, even the new token stops working.
    expect((await post('/v1/auth/refresh', { refreshToken: c.refreshToken })).statusCode).toBe(401);
    expect((await post('/v1/auth/refresh', { refreshToken: next })).statusCode).toBe(401);
    const me = await ctx.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${r1.json().accessToken}` },
    });
    expect(me.statusCode).toBe(401);
    expect(me.json().error.code).toBe('session_revoked');
  });

  it('concurrent refreshes with the same token: exactly one wins', async () => {
    const c = await register(ctx);
    const rs = await Promise.all([
      post('/v1/auth/refresh', { refreshToken: c.refreshToken }),
      post('/v1/auth/refresh', { refreshToken: c.refreshToken }),
    ]);
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 401]);
  });

  it('logout revokes the access token immediately', async () => {
    const c = await register(ctx);
    expect((await c.req('POST', '/v1/auth/logout')).statusCode).toBe(204);
    expect((await c.req('GET', '/v1/me')).statusCode).toBe(401);
    expect((await post('/v1/auth/refresh', { refreshToken: c.refreshToken })).statusCode).toBe(401);
  });

  it('rejects missing, forged, tampered and expired tokens', async () => {
    const c = await register(ctx);
    const get = (auth?: string) =>
      ctx.app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: auth ? { authorization: auth } : {},
      });
    expect((await get()).json().error.code).toBe('missing_token');
    expect((await get('Bearer abc.def.ghi')).statusCode).toBe(401);
    const [h, p] = c.token.split('.');
    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString());
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...payload, sub: '00000000-0000-4000-8000-000000000000' })).toString('base64url')}.${c.token.split('.')[2]}`;
    expect((await get(`Bearer ${tampered}`)).statusCode).toBe(401);
    const forged = await new SignJWT({ sid: payload.sid, role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(c.userId)
      .setIssuer('pepperedapron')
      .setAudience('pepperedapron-app')
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode('another-secret-another-secret-another'));
    expect((await get(`Bearer ${forged}`)).statusCode).toBe(401);
    const expired = await new SignJWT({ sid: payload.sid })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(c.userId)
      .setIssuer('pepperedapron')
      .setAudience('pepperedapron-app')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(ctx.env.JWT_SECRET));
    const r = await get(`Bearer ${expired}`);
    expect(r.statusCode).toBe(401);
    expect(r.json().error.code).toBe('token_expired');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${p}.`;
    expect((await get(`Bearer ${none}`)).statusCode).toBe(401);
  });
});

describe('email flows', () => {
  it('verifies email once; reused/garbage tokens fail', async () => {
    const c = await register(ctx);
    const token = tokenFromLink(lastLinkTo(ctx, c.email));
    expect((await post('/v1/auth/email/verify', { token })).statusCode).toBe(200);
    expect((await c.req('GET', '/v1/me')).json().emailVerified).toBe(true);
    expect((await post('/v1/auth/email/verify', { token })).statusCode).toBe(400);
    expect((await post('/v1/auth/email/verify', { token: 'x'.repeat(40) })).statusCode).toBe(400);
  });

  it('web verification page works and shows a friendly page for bad links', async () => {
    const c = await register(ctx);
    const link = new URL(lastLinkTo(ctx, c.email));
    const ok = await ctx.app.inject({
      method: 'GET',
      url: `${link.pathname}${link.search}`,
      headers: { 'accept-language': 'fr-FR' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain('Adresse confirmée');
    const bad = await ctx.app.inject({ method: 'GET', url: '/auth/verify-email?token=nope' });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).not.toMatch(/error|stack|sql/i);
  });

  it('forgot password: same answer for unknown emails; reset works once and revokes sessions', async () => {
    const c = await register(ctx);
    const unknown = await post('/v1/auth/password/forgot', { email: uniqueEmail() });
    const known = await post('/v1/auth/password/forgot', { email: c.email });
    expect(unknown.statusCode).toBe(202);
    expect(known.statusCode).toBe(202);
    expect(unknown.json()).toEqual(known.json());
    const token = tokenFromLink(lastLinkTo(ctx, c.email));
    expect(
      (await post('/v1/auth/password/reset', { token, password: 'a brand new password' }))
        .statusCode,
    ).toBe(200);
    expect(
      (await post('/v1/auth/password/reset', { token, password: 'another new password' }))
        .statusCode,
    ).toBe(400);
    expect((await c.req('GET', '/v1/me')).statusCode).toBe(401);
    expect(
      (await post('/v1/auth/login', { email: c.email, password: 'a brand new password' }))
        .statusCode,
    ).toBe(200);
    expect(
      (await post('/v1/auth/login', { email: c.email, password: 'correct horse battery' }))
        .statusCode,
    ).toBe(401);
  });

  it('web reset form: GET has no side effect, POST applies', async () => {
    const c = await register(ctx);
    await post('/v1/auth/password/forgot', { email: c.email });
    const token = tokenFromLink(lastLinkTo(ctx, c.email));
    const form = await ctx.app.inject({
      method: 'GET',
      url: `/auth/reset-password?token=${token}`,
    });
    expect(form.body).toContain('<form');
    expect(form.headers['content-security-policy']).toContain("default-src 'none'");
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: `token=${token}&password=${encodeURIComponent('web reset password')}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(r.statusCode).toBe(200);
    expect(
      (await post('/v1/auth/login', { email: c.email, password: 'web reset password' })).statusCode,
    ).toBe(200);
  });

  it('change password requires the current one and revokes other sessions', async () => {
    const c = await register(ctx);
    const other = (
      await post('/v1/auth/login', { email: c.email, password: 'correct horse battery' })
    ).json();
    expect(
      (
        await c.req('POST', '/v1/me/password', {
          currentPassword: 'wrong wrong',
          newPassword: 'another good password',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await c.req('POST', '/v1/me/password', {
          currentPassword: 'correct horse battery',
          newPassword: 'another good password',
        })
      ).statusCode,
    ).toBe(200);
    expect((await c.req('GET', '/v1/me')).statusCode).toBe(200);
    expect(
      (
        await ctx.app.inject({
          method: 'GET',
          url: '/v1/me',
          headers: { authorization: `Bearer ${other.accessToken}` },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('change email needs confirmation from the new address', async () => {
    const c = await register(ctx);
    const newEmail = uniqueEmail('new');
    expect(
      (await c.req('POST', '/v1/me/email', { newEmail, password: 'correct horse battery' }))
        .statusCode,
    ).toBe(202);
    expect((await c.req('GET', '/v1/me')).json().email).toBe(c.email);
    const token = tokenFromLink(lastLinkTo(ctx, newEmail));
    expect((await post('/v1/auth/email/confirm-change', { token })).statusCode).toBe(200);
    expect((await c.req('GET', '/v1/me')).json()).toMatchObject({
      email: newEmail,
      emailVerified: true,
    });
  });

  it('admin role is granted only after verifying an admin e-mail', async () => {
    const c = await register(ctx, 'Admin', 'admin@pepperedapron.test');
    expect((await c.req('GET', '/v1/me')).json().role).toBe('user');
    await verify(ctx, c);
    expect((await c.req('GET', '/v1/me')).json().role).toBe('admin');
  });
});

describe('OAuth (Apple / Google / Facebook)', () => {
  const apple = (claims: Record<string, unknown>, aud = 'app.pepperedapron') =>
    signIdToken(ctx.keys.apple, 'a', claims, { iss: 'https://appleid.apple.com', aud });
  const google = (claims: Record<string, unknown>) =>
    signIdToken(ctx.keys.google, 'g', claims, {
      iss: 'https://accounts.google.com',
      aud: 'google-ios-client',
    });

  it('Sign in with Apple creates then reuses the account, checking the nonce', async () => {
    const sub = `apple-${Date.now()}`;
    const nonce = 'raw-nonce-123';
    const idToken = await apple({
      sub,
      email: `${sub}@privaterelay.appleid.com`,
      email_verified: 'true',
      nonce: sha256hex(nonce),
    });
    const r1 = await post('/v1/auth/oauth/apple', { idToken, nonce, name: 'Hugo' });
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toMatchObject({
      isNewUser: true,
      user: { displayName: 'Hugo', emailVerified: true, providers: ['apple'], hasPassword: false },
    });
    const r2 = await post('/v1/auth/oauth/apple', { idToken, nonce });
    expect(r2.json()).toMatchObject({ isNewUser: false, user: { id: r1.json().user.id } });
    expect((await post('/v1/auth/oauth/apple', { idToken, nonce: 'other' })).statusCode).toBe(401);
    expect((await post('/v1/auth/oauth/apple', { idToken })).statusCode).toBe(401);
  });

  it('rejects wrong audience, wrong signing key and expired tokens', async () => {
    expect(
      (await post('/v1/auth/oauth/apple', { idToken: await apple({ sub: 'x' }, 'com.evil.app') }))
        .statusCode,
    ).toBe(401);
    const signedByGoogleKey = await signIdToken(
      ctx.keys.google,
      'a',
      { sub: 'x' },
      { iss: 'https://appleid.apple.com', aud: 'app.pepperedapron' },
    );
    expect((await post('/v1/auth/oauth/apple', { idToken: signedByGoogleKey })).statusCode).toBe(
      401,
    );
    const expired = await signIdToken(
      ctx.keys.apple,
      'a',
      { sub: 'x' },
      { iss: 'https://appleid.apple.com', aud: 'app.pepperedapron', exp: '-1m' },
    );
    expect((await post('/v1/auth/oauth/apple', { idToken: expired })).statusCode).toBe(401);
    expect((await post('/v1/auth/oauth/twitter', { idToken: 'x' })).statusCode).toBe(400);
  });

  it('Google links to an existing verified account with the same verified e-mail', async () => {
    const c = await register(ctx);
    await verify(ctx, c);
    const r = await post('/v1/auth/oauth/google', {
      idToken: await google({
        sub: `g-${Date.now()}`,
        email: c.email,
        email_verified: true,
        name: 'J',
      }),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().user).toMatchObject({ id: c.userId, providers: ['google'] });
  });

  it('never links to an unverified account (account takeover protection)', async () => {
    const c = await register(ctx);
    const r = await post('/v1/auth/oauth/google', {
      idToken: await google({ sub: `g2-${Date.now()}`, email: c.email, email_verified: true }),
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('email_in_use_sign_in_with_password');
  });

  it('Facebook e-mails are never trusted for linking', async () => {
    const c = await register(ctx);
    await verify(ctx, c);
    const idToken = await signIdToken(
      ctx.keys.facebook,
      'f',
      { sub: `fb-${Date.now()}`, email: c.email },
      { iss: 'https://www.facebook.com', aud: 'fb-app' },
    );
    expect((await post('/v1/auth/oauth/facebook', { idToken })).statusCode).toBe(409);
  });
});

describe('sessions / devices', () => {
  it('lists devices and revokes one (only own sessions)', async () => {
    const c = await register(ctx);
    const other = await register(ctx);
    await post('/v1/auth/login', {
      email: c.email,
      password: 'correct horse battery',
      device: { deviceName: 'iPad', platform: 'ios' },
    });
    const list = (await c.req('GET', '/v1/me/sessions')).json();
    expect(list).toHaveLength(2);
    expect(list.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    const ipad = list.find((s: { current: boolean }) => !s.current);
    expect((await other.req('DELETE', `/v1/me/sessions/${ipad.id}`)).statusCode).toBe(404);
    expect((await c.req('DELETE', `/v1/me/sessions/${ipad.id}`)).statusCode).toBe(204);
    expect((await c.req('GET', '/v1/me/sessions')).json()).toHaveLength(1);
  });
});
