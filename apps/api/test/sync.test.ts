import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectionItemId, favoriteId, shoppingCategoryId, uuidv7 } from '@pepperedapron/core';
import {
  createTestApp,
  op,
  pullAll,
  purgeRecipeTombstone,
  push,
  recipeData,
  register,
  resetSyncHorizon,
  verify,
  type Client,
  type TestCtx,
} from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());

const listData = (p: Record<string, unknown> = {}) => ({
  name: 'Courses de la semaine',
  emoji: null,
  archived: false,
  householdId: null,
  ...p,
});
const itemData = (listId: string, p: Record<string, unknown> = {}) => ({
  listId,
  name: 'Lait',
  quantity: 1,
  unit: 'l',
  categoryKey: 'dairy_eggs',
  checked: false,
  position: 0,
  note: null,
  recipeIds: [],
  ...p,
});

describe('push & pull basics', () => {
  it('creates a recipe offline-style (client id) and pulls it with children', async () => {
    const c = await register(ctx);
    const id = uuidv7();
    const [r] = await push(c, op('recipe', id, recipeData()));
    expect(r!.status).toBe('applied');
    expect(r!.record!.data).toMatchObject({
      title: 'Tarte aux pommes',
      ingredients: [{ name: 'Pommes' }],
    });
    const { records } = await pullAll(c);
    const rec = records.find((x) => x.id === id)!;
    expect(rec.data).toMatchObject({ servings: 6, steps: [{ text: 'Éplucher les pommes.' }] });
  });

  it('is idempotent: replaying the same opId does not create a second write', async () => {
    const c = await register(ctx);
    const o = op('recipe', uuidv7(), recipeData());
    const [a] = await push(c, o);
    const [b] = await push(c, o);
    expect(b!.status).toBe('duplicate');
    expect(b!.record!.version).toBe(a!.record!.version);
  });

  it('rejects invalid data with a reason and does not write', async () => {
    const c = await register(ctx);
    const id = uuidv7();
    const [r] = await push(c, op('recipe', id, recipeData({ title: '', servings: 0 })));
    expect(r!.status).toBe('rejected');
    expect(r!.error).toMatch(/invalid:/);
    expect((await pullAll(c)).records.find((x) => x.id === id)).toBeUndefined();
  });

  it('ignores server-controlled fields sent by the client (ownerId, version, saveCount)', async () => {
    const c = await register(ctx);
    const other = await register(ctx);
    const id = uuidv7();
    const [r] = await push(
      c,
      op('recipe', id, {
        ...recipeData(),
        ownerId: other.userId,
        version: 999999,
        saveCount: 1000,
      } as Record<string, unknown>),
    );
    expect(r!.status).toBe('applied');
    expect(r!.record!.ownerId).toBe(c.userId);
    expect(r!.record!.version).toBeLessThan(999999);
  });

  it('pagination returns every record exactly once, even under concurrent writers', async () => {
    const c = await register(ctx);
    const ids = Array.from({ length: 40 }, () => uuidv7());
    // 4 devices pushing in parallel.
    await Promise.all(
      [0, 1, 2, 3].map((d) =>
        push(
          c,
          ...ids
            .slice(d * 10, d * 10 + 10)
            .map((id) => op('recipe', id, recipeData({ title: `R ${id}` }))),
        ),
      ),
    );
    const { records } = await pullAll(c, 0, 7);
    const got = records.filter((r) => r.entity === 'recipe').map((r) => r.id);
    expect(new Set(got)).toEqual(new Set(ids));
    expect(got).toHaveLength(ids.length);
    const versions = records.map((r) => r.version);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
  });

  it('incremental pull only returns changes after the cursor', async () => {
    const c = await register(ctx);
    const first = await pullAll(c);
    const id = uuidv7();
    await push(c, op('recipe', id, recipeData()));
    const next = await pullAll(c, first.cursor);
    expect(next.records.map((r) => r.id)).toEqual([id]);
    expect((await pullAll(c, next.cursor)).records).toHaveLength(0);
  });
});

describe('conflicts (two devices)', () => {
  it('stale base version: field-level merge keeps both devices changes', async () => {
    const c = await register(ctx);
    const id = uuidv7();
    const [created] = await push(c, op('recipe', id, recipeData()));
    const base = created!.record!;
    // iPhone changes servings, iPad (same base) changes the title.
    const [iphone] = await push(
      c,
      op(
        'recipe',
        id,
        { ...base.data!, servings: 8 },
        { baseVersion: base.version, changedFields: ['servings'] },
      ),
    );
    expect(iphone!.status).toBe('applied');
    const [ipad] = await push(
      c,
      op(
        'recipe',
        id,
        { ...base.data!, title: 'Tarte fine' },
        { baseVersion: base.version, changedFields: ['title'] },
      ),
    );
    expect(ipad!.status).toBe('merged');
    expect(ipad!.record!.data).toMatchObject({ title: 'Tarte fine', servings: 8 });
  });

  it('same field edited on both devices: last writer wins for that field only', async () => {
    const c = await register(ctx);
    const id = uuidv7();
    const [created] = await push(c, op('recipe', id, recipeData({ notes: 'A' })));
    const base = created!.record!;
    await push(
      c,
      op(
        'recipe',
        id,
        { ...base.data!, notes: 'from iPhone', tips: 'tip' },
        { baseVersion: base.version, changedFields: ['notes', 'tips'] },
      ),
    );
    const [r] = await push(
      c,
      op(
        'recipe',
        id,
        { ...base.data!, notes: 'from iPad' },
        { baseVersion: base.version, changedFields: ['notes'] },
      ),
    );
    expect(r!.record!.data).toMatchObject({ notes: 'from iPad', tips: 'tip' });
  });

  it('stale full replace without changedFields only applies fields that actually differ', async () => {
    const c = await register(ctx);
    const id = uuidv7();
    const [created] = await push(c, op('recipe', id, recipeData()));
    const base = created!.record!;
    await push(
      c,
      op(
        'recipe',
        id,
        { ...base.data!, servings: 2 },
        { baseVersion: base.version, changedFields: ['servings'] },
      ),
    );
    const [r] = await push(
      c,
      op('recipe', id, { ...base.data!, title: 'Nouveau' }, { baseVersion: base.version }),
    );
    expect(r!.record!.data).toMatchObject({ title: 'Nouveau' });
  });

  it('edit after delete on another device is refused with the tombstone', async () => {
    const c = await register(ctx);
    const id = uuidv7();
    const [created] = await push(c, op('recipe', id, recipeData()));
    await push(c, op('recipe', id, null, { op: 'delete', baseVersion: created!.record!.version }));
    const [r] = await push(
      c,
      op(
        'recipe',
        id,
        { ...created!.record!.data!, title: 'X' },
        { baseVersion: created!.record!.version, changedFields: ['title'] },
      ),
    );
    expect(r!.status).toBe('gone');
    expect(r!.record!.deleted).toBe(true);
    const [again] = await push(c, op('recipe', id, null, { op: 'delete' }));
    expect(again!.status).toBe('gone');
  });

  it('shopping list edited by two devices: checked state and quantity both survive', async () => {
    const c = await register(ctx);
    const listId = uuidv7();
    const itemId = uuidv7();
    await push(c, op('shoppingList', listId, listData()));
    const [created] = await push(c, op('shoppingItem', itemId, itemData(listId)));
    const base = created!.record!;
    await push(
      c,
      op(
        'shoppingItem',
        itemId,
        { ...base.data!, checked: true },
        { baseVersion: base.version, changedFields: ['checked'] },
      ),
    );
    const [r] = await push(
      c,
      op(
        'shoppingItem',
        itemId,
        { ...base.data!, quantity: 2 },
        { baseVersion: base.version, changedFields: ['quantity'] },
      ),
    );
    expect(r!.record!.data).toMatchObject({ checked: true, quantity: 2 });
  });
});

describe('cascades', () => {
  it('deleting a recipe removes favorites & collection items and keeps planned meals as text', async () => {
    const c = await register(ctx);
    const rid = uuidv7();
    const colId = uuidv7();
    const planId = uuidv7();
    await push(
      c,
      op('recipe', rid, recipeData({ title: 'Carbonara' })),
      op('favorite', favoriteId(c.userId, rid), { recipeId: rid, householdId: null }),
      op('collection', colId, { name: 'Italie', emoji: '🇮🇹', position: 0, householdId: null }),
      op('collectionItem', collectionItemId(colId, rid), {
        collectionId: colId,
        recipeId: rid,
        position: 0,
      }),
      op('mealPlanEntry', planId, {
        date: '2026-10-01',
        slot: 'dinner',
        recipeId: rid,
        customTitle: null,
        servings: 2,
        position: 0,
        householdId: null,
      }),
    );
    const before = await pullAll(c);
    await push(c, op('recipe', rid, null, { op: 'delete' }));
    const after = await pullAll(c, before.cursor);
    const by = (e: string) => after.records.find((r) => r.entity === e)!;
    expect(by('favorite').deleted).toBe(true);
    expect(by('collectionItem').deleted).toBe(true);
    expect(by('mealPlanEntry').data).toMatchObject({ recipeId: null, customTitle: 'Carbonara' });
  });

  it('deleting a shopping list tombstones its items', async () => {
    const c = await register(ctx);
    const listId = uuidv7();
    await push(
      c,
      op('shoppingList', listId, listData()),
      op('shoppingItem', uuidv7(), itemData(listId)),
      op('shoppingItem', uuidv7(), itemData(listId, { name: 'Pain' })),
    );
    const before = await pullAll(c);
    await push(c, op('shoppingList', listId, null, { op: 'delete' }));
    const after = await pullAll(c, before.cursor);
    expect(after.records.filter((r) => r.entity === 'shoppingItem' && r.deleted)).toHaveLength(2);
  });
});

describe('authorization (IDOR)', () => {
  let alice: Client;
  let bob: Client;
  let aliceRecipe: string;
  let aliceList: string;
  let aliceItem: string;
  beforeAll(async () => {
    alice = await register(ctx, 'Alice');
    bob = await register(ctx, 'Bob');
    aliceRecipe = uuidv7();
    aliceList = uuidv7();
    aliceItem = uuidv7();
    await push(
      alice,
      op('recipe', aliceRecipe, recipeData({ title: 'Secret' })),
      op('shoppingList', aliceList, listData()),
      op('shoppingItem', aliceItem, itemData(aliceList)),
    );
  });

  it("Bob cannot read Alice's private data", async () => {
    const { records } = await pullAll(bob);
    expect(records.some((r) => [aliceRecipe, aliceList, aliceItem].includes(r.id))).toBe(false);
    expect(JSON.stringify(records)).not.toContain('Secret');
  });

  it("Bob cannot modify or delete Alice's rows by reusing their ids", async () => {
    const results = await push(
      bob,
      op('recipe', aliceRecipe, recipeData({ title: 'pwned' })),
      op('recipe', aliceRecipe, null, { op: 'delete' }),
      op('shoppingList', aliceList, listData({ name: 'pwned' })),
      op('shoppingItem', aliceItem, itemData(aliceList, { name: 'pwned' })),
    );
    expect(results.map((r) => r.status)).toEqual([
      'forbidden',
      'forbidden',
      'forbidden',
      'forbidden',
    ]);
    expect(results.every((r) => r.record === undefined)).toBe(true);
    const { records } = await pullAll(alice);
    expect(JSON.stringify(records)).not.toContain('pwned');
  });

  it("Bob cannot add items to Alice's list, favorite or plan her private recipe, or touch her settings", async () => {
    const results = await push(
      bob,
      op('shoppingItem', uuidv7(), itemData(aliceList)),
      op('favorite', favoriteId(bob.userId, aliceRecipe), {
        recipeId: aliceRecipe,
        householdId: null,
      }),
      op('mealPlanEntry', uuidv7(), {
        date: '2026-10-01',
        slot: 'lunch',
        recipeId: aliceRecipe,
        customTitle: null,
        servings: null,
        position: 0,
        householdId: null,
      }),
      op('settings', alice.userId, { theme: 'dark' }),
    );
    expect(results.map((r) => r.status)).toEqual([
      'forbidden',
      'forbidden',
      'forbidden',
      'forbidden',
    ]);
  });

  it('Bob cannot share rows into a household he does not belong to', async () => {
    const h = (await alice.req('POST', '/v1/household', { name: 'Maison Alice' })).json().household;
    const [r] = await push(bob, op('shoppingList', uuidv7(), listData({ householdId: h.id })));
    expect(r!.status).toBe('forbidden');
    await alice.req('DELETE', '/v1/household');
  });

  it('favorite ids must be deterministic (no duplicates across devices)', async () => {
    const rid = uuidv7();
    await push(bob, op('recipe', rid, recipeData()));
    const [bad] = await push(bob, op('favorite', uuidv7(), { recipeId: rid, householdId: null }));
    expect(bad!.status).toBe('rejected');
    const fid = favoriteId(bob.userId, rid);
    const [a] = await push(bob, op('favorite', fid, { recipeId: rid, householdId: null }));
    expect(a!.status).toBe('applied');
  });

  it('photoKey must be an upload owned by the user', async () => {
    const [r] = await push(
      bob,
      op('recipe', uuidv7(), recipeData({ photoKey: `u/${alice.userId}/${uuidv7()}.jpg` })),
    );
    expect(r!.status).toBe('forbidden');
    expect(r!.error).toBe('photo_not_owned');
  });

  it('immutable fields cannot be changed', async () => {
    const [cat] = await push(
      bob,
      op('shoppingCategory', shoppingCategoryId(bob.userId, 'produce'), {
        key: 'produce',
        name: null,
        position: 0,
        hidden: false,
      }),
    );
    const [r] = await push(
      bob,
      op(
        'shoppingCategory',
        shoppingCategoryId(bob.userId, 'produce'),
        { key: 'hacked', name: null, position: 0, hidden: false },
        { baseVersion: cat!.record!.version },
      ),
    );
    expect(r!.status).toBe('rejected');
  });

  it('publishing requires a verified e-mail', async () => {
    const eve = await register(ctx, 'Eve');
    const [r] = await push(eve, op('recipe', uuidv7(), recipeData({ visibility: 'public' })));
    expect(r!.error).toBe('publish_requires_verified_email');
    await verify(ctx, eve);
    const [ok] = await push(eve, op('recipe', uuidv7(), recipeData({ visibility: 'public' })));
    expect(ok!.status).toBe('applied');
  });

  it('unauthenticated sync is refused; malformed pushes are rejected', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/sync/pull' })).statusCode).toBe(401);
    expect((await bob.req('POST', '/v1/sync/push', { ops: [] })).statusCode).toBe(400);
    expect(
      (
        await bob.req('POST', '/v1/sync/push', {
          ops: [{ ...op('recipe', 'not-a-uuid', {}), id: "1' OR '1'='1" }],
        })
      ).statusCode,
    ).toBe(400);
    expect((await bob.req('GET', '/v1/sync/pull?cursor=-5')).statusCode).toBe(400);
  });

  it('an opId reused by another user is not replayed to them', async () => {
    const o = op('recipe', uuidv7(), recipeData());
    await push(alice, o);
    const [r] = await push(bob, o);
    expect(r!.status).toBe('forbidden');
  });
});

describe('households', () => {
  it('shared rows become visible to members; leaving bumps the scope epoch and unshares', async () => {
    const hugo = await register(ctx, 'Hugo');
    const julie = await register(ctx, 'Julie');
    const h = (await hugo.req('POST', '/v1/household', { name: 'Maison Busquet' })).json()
      .household;
    const invite = (await hugo.req('POST', '/v1/household/invites')).json();
    expect(invite.code).toMatch(/^[A-Z2-9]{8}$/);
    const joined = await julie.req('POST', '/v1/household/join', {
      code: invite.code.toLowerCase(),
    });
    expect(
      joined.json().household.members.map((m: { displayName: string }) => m.displayName),
    ).toEqual(['Hugo', 'Julie']);

    const listId = uuidv7();
    const privateId = uuidv7();
    await push(
      hugo,
      op('shoppingList', listId, listData({ householdId: h.id })),
      op('shoppingList', privateId, listData({ name: 'Perso' })),
    );
    const itemId = uuidv7();
    // Julie adds to the shared list; the item is owned by the list owner and shared too.
    const [added] = await push(
      julie,
      op('shoppingItem', itemId, itemData(listId, { name: 'Beurre' })),
    );
    expect(added!.status).toBe('applied');
    const jPull = await pullAll(julie);
    expect(jPull.records.map((r) => r.id)).toEqual(expect.arrayContaining([listId, itemId]));
    expect(jPull.records.some((r) => r.id === privateId)).toBe(false);
    // Julie can edit but not un-share Hugo's list.
    const listRec = jPull.records.find((r) => r.id === listId)!;
    const [unshare] = await push(
      julie,
      op(
        'shoppingList',
        listId,
        { ...listRec.data!, householdId: null },
        { baseVersion: listRec.version, changedFields: ['householdId'] },
      ),
    );
    expect(unshare!.status).toBe('forbidden');

    const epochBefore = jPull.epoch;
    await julie.req('POST', '/v1/household/leave');
    const after = await pullAll(julie);
    expect(after.epoch).toBeGreaterThan(epochBefore);
    expect(after.records.some((r) => r.id === listId)).toBe(false);
    expect((await julie.req('GET', '/v1/household')).json().household).toBeNull();
  });

  it('invalid, reused-too-often or expired codes are refused; one household per user', async () => {
    const a = await register(ctx);
    const b = await register(ctx);
    expect((await b.req('POST', '/v1/household/join', { code: 'ZZZZZZZZ' })).statusCode).toBe(400);
    await a.req('POST', '/v1/household', { name: 'A' });
    expect((await a.req('POST', '/v1/household', { name: 'A2' })).statusCode).toBe(409);
    const { code } = (await a.req('POST', '/v1/household/invites')).json();
    await b.req('POST', '/v1/household/join', { code });
    expect((await b.req('POST', '/v1/household/join', { code })).statusCode).toBe(409);
  });

  it('owner can remove a member; a member cannot remove anyone', async () => {
    const a = await register(ctx, 'Owner');
    const b = await register(ctx, 'Member');
    const c = await register(ctx, 'Member2');
    await a.req('POST', '/v1/household', { name: 'H' });
    const { code } = (await a.req('POST', '/v1/household/invites')).json();
    await b.req('POST', '/v1/household/join', { code });
    await c.req('POST', '/v1/household/join', { code });
    expect((await b.req('DELETE', `/v1/household/members/${c.userId}`)).statusCode).toBe(403);
    expect((await a.req('DELETE', `/v1/household/members/${b.userId}`)).statusCode).toBe(200);
    expect((await b.req('GET', '/v1/household')).json().household).toBeNull();
    // Owner leaves → ownership passes to the oldest remaining member.
    await a.req('POST', '/v1/household/leave');
    expect((await c.req('GET', '/v1/household')).json().household.myRole).toBe('owner');
  });

  it('notifies members with a push when someone joins', async () => {
    const a = await register(ctx, 'Anna');
    const b = await register(ctx, 'Ben');
    await a.req('PUT', '/v1/me/push-token', {
      token: 'ExponentPushToken[abcdefghijklmnop]',
      platform: 'ios',
    });
    await a.req('POST', '/v1/household', { name: 'H' });
    const { code } = (await a.req('POST', '/v1/household/invites')).json();
    await b.req('POST', '/v1/household/join', { code });
    expect(
      ctx.push.sent.some(
        (m) => m.to === 'ExponentPushToken[abcdefghijklmnop]' && m.body.includes('Ben'),
      ),
    ).toBe(true);
  });
});

describe('household push preferences', () => {
  const setup = async (token: string) => {
    const a = await register(ctx, 'Anna');
    const b = await register(ctx, 'Ben');
    await a.req('PUT', '/v1/me/push-token', { token, platform: 'ios' });
    await a.req('POST', '/v1/household', { name: 'H' });
    const { code } = (await a.req('POST', '/v1/household/invites')).json();
    return { a, b, code };
  };

  it('does not notify a member who switched household notifications off', async () => {
    const token = 'ExponentPushToken[optedoutmember01]';
    const { a, b, code } = await setup(token);
    const s = (await pullAll(a)).records.find((r) => r.entity === 'settings')!;
    const notifications = {
      ...(s.data!.notifications as Record<string, unknown>),
      household: false,
    };
    await push(
      a,
      op(
        'settings',
        a.userId,
        { ...s.data!, notifications },
        { baseVersion: s.version, changedFields: ['notifications'] },
      ),
    );
    await b.req('POST', '/v1/household/join', { code });
    expect(ctx.push.sent.some((m) => m.to === token)).toBe(false);
  });

  it('forgets tokens the push service reports as unregistered', async () => {
    const { pushTokens } = await import('../src/db/schema');
    const { eq } = await import('drizzle-orm');
    const token = 'ExponentPushToken[uninstalledapp01]';
    ctx.push.invalid.add(token);
    const { b, code } = await setup(token);
    await b.req('POST', '/v1/household/join', { code });
    expect(ctx.push.sent.some((m) => m.to === token)).toBe(true);
    expect(await ctx.db.select().from(pushTokens).where(eq(pushTokens.token, token))).toHaveLength(
      0,
    );
  });
});

describe('public recipes in sync', () => {
  it('favorited public recipes are pulled read-only and disappear when unpublished', async () => {
    const author = await register(ctx, 'Chef');
    await verify(ctx, author);
    const reader = await register(ctx, 'Reader');
    const rid = uuidv7();
    const [pub] = await push(
      author,
      op('recipe', rid, recipeData({ visibility: 'public', title: 'Public tarte' })),
    );
    const [fav] = await push(
      reader,
      op('favorite', favoriteId(reader.userId, rid), { recipeId: rid, householdId: null }),
    );
    expect(fav!.status).toBe('applied');
    const p1 = await pullAll(reader);
    expect(p1.records.find((r) => r.id === rid)!.data).toMatchObject({ title: 'Public tarte' });
    // Reader can't edit it.
    const [edit] = await push(reader, op('recipe', rid, recipeData({ title: 'x' })));
    expect(edit!.status).toBe('forbidden');
    await push(
      author,
      op(
        'recipe',
        rid,
        { ...pub!.record!.data!, visibility: 'private' },
        { baseVersion: pub!.record!.version, changedFields: ['visibility'] },
      ),
    );
    const p2 = await pullAll(reader, p1.cursor);
    expect(p2.records.find((r) => r.id === rid)).toMatchObject({ deleted: true, data: null });
  });
});

describe('tombstone purge horizon', () => {
  it('forces a full resync for cursors older than purged tombstones', async () => {
    const { recipes } = await import('../src/db/schema');
    const { eq } = await import('drizzle-orm');
    const c = await register(ctx);
    const keep = uuidv7();
    const gone = uuidv7();
    await push(c, op('recipe', keep, recipeData({ title: 'Gardée' })));
    const [created] = await push(c, op('recipe', gone, recipeData({ title: 'Supprimée' })));
    const staleCursor = created!.record!.version;
    await push(c, op('recipe', gone, null, { op: 'delete' }));
    // A device that synced before the deletion goes offline for months…
    await purgeRecipeTombstone(ctx, gone);
    expect(await ctx.db.select().from(recipes).where(eq(recipes.id, gone))).toHaveLength(0);

    // …its next pull cannot see the tombstone any more, so the server asks for a resync.
    const stale = await c.req('GET', `/v1/sync/pull?cursor=${staleCursor}`);
    expect(stale.json()).toMatchObject({ resync: true, cursor: 0, records: [] });

    // Up-to-date devices are unaffected, and a pull from 0 converges without the deleted recipe.
    const { records, cursor } = await pullAll(c);
    expect(records.some((r) => r.id === keep && !r.deleted)).toBe(true);
    expect(records.some((r) => r.id === gone)).toBe(false);
    const fresh = await c.req('GET', `/v1/sync/pull?cursor=${cursor}`);
    expect(fresh.json().resync).toBeUndefined();
    await resetSyncHorizon(ctx);
  });
});
