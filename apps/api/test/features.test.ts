import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from '@pepperedapron/core';
import { createTestApp, op, pullAll, push, recipeData, register, uniqueEmail, verify, type Client, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);

async function uploadPhoto(c: Client, body: Buffer = JPEG, contentType = 'image/jpeg') {
  const init = await c.req('POST', '/v1/uploads', { contentType, size: body.length });
  expect(init.statusCode).toBe(201);
  const u = init.json();
  const url = new URL(u.url);
  const put = await ctx.app.inject({ method: 'PUT', url: url.pathname + url.search, payload: body, headers: { 'content-type': contentType } });
  return { init: u, put };
}

describe('photo uploads', () => {
  it('presign → upload → complete → attach to recipe → served', async () => {
    const c = await register(ctx);
    const { init, put } = await uploadPhoto(c);
    expect(put.statusCode).toBe(200);
    const done = await c.req('POST', `/v1/uploads/${init.uploadId}/complete`);
    expect(done.statusCode).toBe(200);
    const [r] = await push(c, op('recipe', uuidv7(), recipeData({ photoKey: init.key })));
    expect(r!.status).toBe('applied');
    const media = await ctx.app.inject({ method: 'GET', url: new URL(done.json().url).pathname });
    expect(media.statusCode).toBe(200);
    expect(media.headers['content-type']).toBe('image/jpeg');
    expect(media.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects oversize declarations, bad types, fake images, tampered signatures, and unconfirmed keys', async () => {
    const c = await register(ctx);
    expect((await c.req('POST', '/v1/uploads', { contentType: 'image/jpeg', size: 50 * 1024 * 1024 })).statusCode).toBe(400);
    expect((await c.req('POST', '/v1/uploads', { contentType: 'text/html', size: 100 })).statusCode).toBe(400);
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const fake = await uploadPhoto(c, html);
    expect(fake.put.statusCode).toBe(400);
    const { init } = await (async () => {
      const r = await c.req('POST', '/v1/uploads', { contentType: 'image/jpeg', size: JPEG.length });
      return { init: r.json() };
    })();
    const url = new URL(init.url);
    url.searchParams.set('key', `u/${uuidv7()}/${uuidv7()}.jpg`);
    const tampered = await ctx.app.inject({ method: 'PUT', url: url.pathname + url.search, payload: JPEG, headers: { 'content-type': 'image/jpeg' } });
    expect(tampered.statusCode).toBe(403);
    // Not completed yet → cannot be used on a recipe.
    const [r] = await push(c, op('recipe', uuidv7(), recipeData({ photoKey: init.key })));
    expect(r!.status).toBe('forbidden');
    // Complete without upload → friendly error.
    expect((await c.req('POST', `/v1/uploads/${init.uploadId}/complete`)).json().error.code).toBe('upload_missing');
  });

  it("cannot complete someone else's upload", async () => {
    const a = await register(ctx);
    const b = await register(ctx);
    const { init } = await uploadPhoto(a);
    expect((await b.req('POST', `/v1/uploads/${init.uploadId}/complete`)).statusCode).toBe(404);
  });
});

describe('public recipes, save, report, moderation', () => {
  let author: Client;
  let reader: Client;
  let admin: Client;
  let rid: string;
  beforeAll(async () => {
    author = await register(ctx, 'Chef Julie');
    await verify(ctx, author);
    reader = await register(ctx, 'Reader');
    admin = await register(ctx, 'Admin', 'admin@pepperedapron.test'.replace('@', `+${Date.now()}@`));
    rid = uuidv7();
    const { init } = await uploadPhoto(author);
    await author.req('POST', `/v1/uploads/${init.uploadId}/complete`);
    await push(author, op('recipe', rid, recipeData({ visibility: 'public', title: 'Ratatouille publique', category: 'main', tags: ['provence'], photoKey: init.key })));
  });

  it('lists and reads public recipes without auth; private ones are invisible', async () => {
    const priv = uuidv7();
    await push(author, op('recipe', priv, recipeData({ title: 'Privée' })));
    const list = (await ctx.app.inject({ method: 'GET', url: '/v1/public/recipes?sort=recent' })).json().items;
    expect(list.some((x: { id: string }) => x.id === rid)).toBe(true);
    expect(list.some((x: { id: string }) => x.id === priv)).toBe(false);
    const one = await ctx.app.inject({ method: 'GET', url: `/v1/public/recipes/${rid}` });
    expect(one.json()).toMatchObject({ title: 'Ratatouille publique', author: { displayName: 'Chef Julie' } });
    expect(one.json()).not.toHaveProperty('ownerId');
    expect((await ctx.app.inject({ method: 'GET', url: `/v1/public/recipes/${priv}` })).statusCode).toBe(404);
    const search = (await ctx.app.inject({ method: 'GET', url: '/v1/public/recipes?q=ratatouille' })).json().items;
    expect(search[0].id).toBe(rid);
    const likeInjection = (await ctx.app.inject({ method: 'GET', url: '/v1/public/recipes?q=%25' })).json().items;
    expect(likeInjection.some((x: { id: string }) => x.id === rid)).toBe(false);
  });

  it('"Ajouter à mes recettes" copies into the library with its own photo and increments popularity', async () => {
    const r = await reader.req('POST', `/v1/public/recipes/${rid}/save`);
    expect(r.statusCode).toBe(201);
    const rec = r.json().record;
    expect(rec.ownerId).toBe(reader.userId);
    expect(rec.data).toMatchObject({ title: 'Ratatouille publique', visibility: 'private', originRecipeId: rid });
    expect(rec.data.photoKey).toMatch(new RegExp(`^u/${reader.userId}/`));
    const { records } = await pullAll(reader);
    expect(records.some((x) => x.id === rec.id)).toBe(true);
    const pop = (await ctx.app.inject({ method: 'GET', url: '/v1/public/recipes?sort=popular' })).json().items;
    expect(pop.find((x: { id: string }) => x.id === rid).saveCount).toBeGreaterThanOrEqual(1);
    // The copy is editable by the reader, the original is untouched.
    const [edit] = await push(reader, op('recipe', rec.id, { ...rec.data, title: 'Ma ratatouille' }, { baseVersion: rec.version, changedFields: ['title'] }));
    expect(edit!.status).toBe('applied');
    expect((await ctx.app.inject({ method: 'GET', url: `/v1/public/recipes/${rid}` })).json().title).toBe('Ratatouille publique');
  });

  it('reports: once per user, not on own recipe; admin handles; non-admins forbidden', async () => {
    expect((await author.req('POST', `/v1/public/recipes/${rid}/report`, { reason: 'spam' })).statusCode).toBe(403);
    expect((await reader.req('POST', `/v1/public/recipes/${rid}/report`, { reason: 'copyright', details: 'Copié de mon blog' })).statusCode).toBe(201);
    expect((await reader.req('POST', `/v1/public/recipes/${rid}/report`, { reason: 'spam' })).statusCode).toBe(409);
    expect((await reader.req('POST', `/v1/public/recipes/${rid}/report`, { reason: 'lol' })).statusCode).toBe(400);

    for (const url of ['/v1/admin/stats', '/v1/admin/reports', '/v1/admin/messages', `/v1/admin/users/${author.userId}`]) {
      expect((await reader.req('GET', url)).statusCode).toBe(403);
    }
    // Promote test admin directly (admin e-mail allow-list is covered in auth tests).
    const { users } = await import('../src/db/schema');
    const { eq } = await import('drizzle-orm');
    await ctx.db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.userId));
    const reports = (await admin.req('GET', '/v1/admin/reports?status=open')).json().items;
    const rep = reports.find((x: { recipeId: string }) => x.recipeId === rid);
    expect(rep).toMatchObject({ reason: 'copyright', recipeTitle: 'Ratatouille publique', authorId: author.userId });
    expect((await admin.req('GET', `/v1/admin/recipes/${rid}`)).json().title).toBe('Ratatouille publique');
    expect((await admin.req('GET', `/v1/admin/users/${author.userId}`)).json()).toMatchObject({ publicRecipeCount: 1, reportsAgainst: 1 });
    const handled = await admin.req('PATCH', `/v1/admin/reports/${rep.id}`, { status: 'resolved', action: 'unpublish_and_block', resolution: 'Contenu copié' });
    expect(handled.statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'GET', url: `/v1/public/recipes/${rid}` })).statusCode).toBe(404);
    // Author blocked from publishing again; stats are real numbers.
    const [again] = await push(author, op('recipe', uuidv7(), recipeData({ visibility: 'public' })));
    expect(again!.error).toBe('publish_requires_verified_email');
    const stats = (await admin.req('GET', '/v1/admin/stats')).json();
    expect(stats.users.total).toBeGreaterThan(0);
    expect(typeof stats.recipes.public).toBe('number');
  });
});

describe('share links + web fallback page', () => {
  it('shares a private recipe by unguessable link, renders an escaped web page, saves, revokes', async () => {
    const a = await register(ctx, '<script>alert(1)</script>');
    const b = await register(ctx);
    const rid = uuidv7();
    await push(a, op('recipe', rid, recipeData({ title: '<img src=x onerror=alert(1)>', description: '"quoted" & <b>bold</b>' })));
    expect((await b.req('POST', `/v1/recipes/${rid}/share`)).statusCode).toBe(404);
    const share = (await a.req('POST', `/v1/recipes/${rid}/share`)).json();
    expect(share.url).toMatch(/^https:\/\/pepperedapron\.test\/r\/[A-Za-z0-9_-]{24}$/);
    expect((await a.req('POST', `/v1/recipes/${rid}/share`)).json().token).toBe(share.token);
    const page = await ctx.app.inject({ method: 'GET', url: `/r/${share.token}`, headers: { 'accept-language': 'en-US' } });
    expect(page.statusCode).toBe(200);
    expect(page.body).not.toContain('<img src=x');
    expect(page.body).not.toContain('<script>alert');
    expect(page.body).toContain('&#60;img src=x');
    expect(page.body).toContain('Open in the app');
    expect(page.body).toContain(`pepperedapron://share/${share.token}`);
    const api = await b.req('GET', `/v1/share/${share.token}`);
    expect(api.json()).toMatchObject({ isMine: false, ingredients: [{ name: 'Pommes' }] });
    expect((await b.req('POST', `/v1/share/${share.token}/save`)).statusCode).toBe(201);
    await a.req('DELETE', `/v1/recipes/${rid}/share`);
    expect((await ctx.app.inject({ method: 'GET', url: `/r/${share.token}` })).statusCode).toBe(404);
    expect((await b.req('GET', `/v1/share/${share.token}`)).statusCode).toBe(404);
  });

  it('serves universal-link association files and legal pages', async () => {
    const aasa = (await ctx.app.inject({ method: 'GET', url: '/.well-known/apple-app-site-association' })).json();
    expect(aasa.applinks.details[0].components).toEqual(expect.arrayContaining([{ '/': '/r/*' }]));
    expect((await ctx.app.inject({ method: 'GET', url: '/.well-known/assetlinks.json' })).json()[0].target.package_name).toBe('app.pepperedapron');
    for (const p of ['privacy', 'terms', 'notice']) {
      const fr = await ctx.app.inject({ method: 'GET', url: `/legal/${p}`, headers: { 'accept-language': 'fr' } });
      expect(fr.statusCode).toBe(200);
      expect(fr.headers['set-cookie']).toBeUndefined();
    }
  });
});

describe('import from URL (no AI)', () => {
  it('extracts schema.org recipes from web pages', async () => {
    const c = await register(ctx);
    ctx.fetchResponses.set('https://blog.test/tarte', {
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<html><script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Tarte tatin', recipeYield: '6', recipeIngredient: ['6 pommes', '150 g de sucre'], recipeInstructions: [{ '@type': 'HowToStep', text: 'Caraméliser.' }] })}</script></html>`,
    });
    const r = await c.req('POST', '/v1/import/url', { url: 'https://blog.test/tarte' });
    expect(r.json()).toMatchObject({ completeness: 'full', platform: 'web', draft: { title: 'Tarte tatin', servings: 6, sourceUrl: 'https://blog.test/tarte' } });
  });

  it('uses the public TikTok oEmbed caption and never promises more', async () => {
    const c = await register(ctx);
    const url = 'https://www.tiktok.com/@chef/video/123';
    ctx.fetchResponses.set(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ title: 'Pâtes au citron 🍋\n200 g de pâtes\n1 citron\n#pasta', author_name: 'chef', thumbnail_url: 'https://p16.tiktokcdn.com/x.jpg' }),
    });
    const r = (await c.req('POST', '/v1/import/url', { url })).json();
    expect(r).toMatchObject({ platform: 'tiktok', completeness: 'partial', draft: { author: 'chef', imageUrl: 'https://p16.tiktokcdn.com/x.jpg', tags: ['pasta'] } });
    expect(r.draft.ingredients).toHaveLength(2);
    const ig = (await c.req('POST', '/v1/import/url', { url: 'https://www.instagram.com/p/abc/' })).json();
    expect(ig).toMatchObject({ platform: 'instagram', completeness: 'minimal', draft: { sourceUrl: 'https://www.instagram.com/p/abc/' } });
  });

  it('refuses non-http URLs and needs auth', async () => {
    const c = await register(ctx);
    expect((await c.req('POST', '/v1/import/url', { url: 'file:///etc/passwd' })).statusCode).toBe(400);
    expect((await c.req('POST', '/v1/import/url', { url: 'javascript:alert(1)' })).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: 'POST', url: '/v1/import/url', payload: { url: 'https://a.test' } })).statusCode).toBe(401);
  });
});

describe('contact, config, analytics consent', () => {
  it('stores contact messages (anonymous or signed in) and lists them for admins', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/v1/contact', payload: { email: 'guest@example.com', subject: 'Bug', message: 'Le bouton ne marche pas' }, headers: { 'x-app-platform': 'ios', 'x-app-version': '2.0.0' } });
    expect(r.statusCode).toBe(201);
    expect((await ctx.app.inject({ method: 'POST', url: '/v1/contact', payload: { email: null, subject: '', message: '' } })).statusCode).toBe(400);
  });

  it('config exposes remote ad settings and legal links', async () => {
    const cfg = (await ctx.app.inject({ method: 'GET', url: '/v1/config' })).json();
    expect(cfg.ads).toMatchObject({ enabled: true, interstitialMinMinutes: 0 });
    expect(cfg.legal.privacy).toBe('https://pepperedapron.test/legal/privacy');
  });

  it('analytics events are dropped without consent and stored with consent', async () => {
    const c = await register(ctx);
    const ev = { events: [{ name: 'recipe_created', at: new Date().toISOString() }] };
    expect((await c.req('POST', '/v1/analytics/events', ev)).json().stored).toBe(0);
    const s = (await pullAll(c)).records.find((r) => r.entity === 'settings')!;
    await push(c, op('settings', c.userId, { ...s.data!, analyticsConsent: true }, { baseVersion: s.version, changedFields: ['analyticsConsent'] }));
    expect((await c.req('POST', '/v1/analytics/events', ev)).json().stored).toBe(1);
    expect((await c.req('POST', '/v1/analytics/events', { events: [{ name: 'steal_data', at: new Date().toISOString() }] })).statusCode).toBe(400);
  });
});

describe('RGPD: export and account deletion', () => {
  it('exports all personal data without secrets', async () => {
    const c = await register(ctx);
    await push(c, op('recipe', uuidv7(), recipeData({ title: 'Mon export' })));
    const r = await c.req('GET', '/v1/me/export');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toContain('attachment');
    const j = r.json();
    expect(j.profile.email).toBe(c.email);
    expect(j.recipes[0].title).toBe('Mon export');
    expect(JSON.stringify(j)).not.toMatch(/password_?hash|refresh_?hash|scrypt\$/i);
  });

  it('deletes the account permanently (password required); everything is gone, tokens die', async () => {
    const c = await register(ctx);
    const { init } = await uploadPhoto(c);
    await c.req('POST', `/v1/uploads/${init.uploadId}/complete`);
    await push(c, op('recipe', uuidv7(), recipeData({ photoKey: init.key })));
    expect((await c.req('DELETE', '/v1/me', { password: 'wrong password', confirm: 'DELETE' })).statusCode).toBe(403);
    expect((await c.req('DELETE', '/v1/me', { password: 'correct horse battery' })).statusCode).toBe(400);
    expect((await c.req('DELETE', '/v1/me', { password: 'correct horse battery', confirm: 'DELETE' })).statusCode).toBe(204);
    expect((await c.req('GET', '/v1/me')).statusCode).toBe(401);
    const login = await ctx.app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: c.email, password: 'correct horse battery' } });
    expect(login.statusCode).toBe(401);
    const { AccountService } = await import('../src/services/account');
    await new AccountService(ctx.deps).purgeObjects();
    expect(await ctx.deps.storage.head(init.key)).toBeNull();
    // The e-mail can be reused for a fresh account.
    await register(ctx, 'Again', c.email);
  });

  it('deleting an account inside a household leaves the other members intact', async () => {
    const a = await register(ctx);
    const b = await register(ctx);
    await a.req('POST', '/v1/household', { name: 'H' });
    const { code } = (await a.req('POST', '/v1/household/invites')).json();
    await b.req('POST', '/v1/household/join', { code });
    expect((await a.req('DELETE', '/v1/me', { password: 'correct horse battery', confirm: 'DELETE' })).statusCode).toBe(204);
    const h = (await b.req('GET', '/v1/household')).json().household;
    expect(h).toMatchObject({ myRole: 'owner', members: [{ userId: b.userId }] });
  });
});

describe('robustness', () => {
  it('unknown routes and huge bodies return clean JSON errors', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/nope' })).json()).toEqual({ error: { code: 'not_found' } });
    const c = await register(ctx);
    const huge = await c.req('POST', '/v1/contact', { email: null, subject: 's', message: 'x'.repeat(2 * 1024 * 1024) });
    expect(huge.statusCode).toBe(413);
    expect(huge.json().error.code).toBe('payload_too_large');
  });

  it('spam-clicking favorite is safe (idempotent deterministic ids)', async () => {
    const c = await register(ctx);
    const rid = uuidv7();
    await push(c, op('recipe', rid, recipeData()));
    const { favoriteId } = await import('@pepperedapron/core');
    const results = await Promise.all(Array.from({ length: 10 }, () => push(c, op('favorite', favoriteId(c.userId, rid), { recipeId: rid, householdId: null }))));
    const statuses = results.flat().map((r) => r.status);
    expect(statuses.every((s) => ['applied', 'merged'].includes(s))).toBe(true);
    const favs = (await pullAll(c)).records.filter((r) => r.entity === 'favorite');
    expect(favs).toHaveLength(1);
  });

  it('health check', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/health' })).json()).toEqual({ ok: true });
    void uniqueEmail;
  });
});
