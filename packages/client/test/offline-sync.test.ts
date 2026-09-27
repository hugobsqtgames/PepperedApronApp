import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { favoriteId } from '@pepperedapron/core';
import { emptyRecipe, recipeFromDraft, ValidationError } from '../src';
import { parseRecipeText } from '@pepperedapron/core';
import { Device, startServer, type Server } from './devices';

let server: Server;
beforeAll(async () => {
  server = await startServer();
});
afterAll(async () => server.close());

let n = 0;
const email = () => `device.${Date.now()}.${++n}@example.com`;

async function pair(): Promise<[Device, Device]> {
  const iphone = await Device.create(server, 'iphone');
  const ipad = await Device.create(server, 'ipad');
  const e = email();
  await iphone.signUp(e);
  await ipad.signIn(e);
  await iphone.sync.sync();
  await ipad.sync.sync();
  return [iphone, ipad];
}

const recipe = (title: string) => ({ ...emptyRecipe(4), title, ingredients: [{ id: crypto.randomUUID(), group: null, name: 'Farine', quantity: 250, quantityMax: null, unit: 'g', note: null }] });

describe('offline first', () => {
  it('works fully offline, then syncs automatically and shows sync state', async () => {
    const [iphone, ipad] = await pair();
    iphone.online = false;
    const r = await iphone.repos.createRecipe(recipe('Crêpes'));
    await iphone.repos.toggleFavorite(r.id);
    const list = await iphone.repos.createList('Courses');
    await iphone.repos.addItemText(list.id, '2 kg de pommes de terre');
    await iphone.repos.planMeal({ date: '2026-10-05', slot: 'dinner', recipeId: r.id });
    expect(iphone.repos.recipe(r.id)!.state).toBe('pending');
    expect(await iphone.store.pendingCount()).toBeGreaterThan(0);
    await iphone.sync.sync();
    expect(iphone.sync.snapshot).toMatchObject({ status: 'offline', error: 'offline' });

    iphone.online = true;
    await iphone.sync.sync();
    expect(iphone.sync.snapshot.status).toBe('idle');
    expect(await iphone.store.pendingCount()).toBe(0);
    expect(iphone.repos.recipe(r.id)!.state).toBe('synced');

    await ipad.sync.sync();
    expect(ipad.repos.recipe(r.id)!.data.title).toBe('Crêpes');
    expect(ipad.repos.isFavorite(r.id)).toBe(true);
    expect(ipad.repos.items(list.id).map((i) => [i.data.name, i.data.quantity, i.data.unit, i.data.categoryKey])).toEqual([['pommes de terre', 2, 'kg', 'produce']]);
    expect(ipad.repos.entries('2026-10-05', '2026-10-05')).toHaveLength(1);
    expect(ipad.repos.activeList()!.id).toBe(list.id);
  });

  it('create + delete while offline never reaches the server', async () => {
    const [iphone] = await pair();
    iphone.online = false;
    const r = await iphone.repos.createRecipe(recipe('Brouillon'));
    await iphone.repos.deleteRecipe(r.id);
    expect(await iphone.store.pendingCount()).toBe(0);
    iphone.online = true;
    await iphone.sync.sync();
    expect(iphone.repos.recipe(r.id)).toBeNull();
  });

  it('coalesces many offline edits into one operation', async () => {
    const [iphone, ipad] = await pair();
    iphone.online = false;
    const r = await iphone.repos.createRecipe(recipe('V1'));
    for (let i = 2; i <= 20; i++) await iphone.repos.updateRecipe(r.id, { title: `V${i}` });
    expect(await iphone.store.pendingCount()).toBe(1);
    iphone.online = true;
    await iphone.sync.sync();
    await ipad.sync.sync();
    expect(ipad.repos.recipe(r.id)!.data.title).toBe('V20');
  });
});

describe('conflicts between iPhone and iPad', () => {
  it('both edit different fields offline → both changes kept everywhere', async () => {
    const [iphone, ipad] = await pair();
    const r = await iphone.repos.createRecipe(recipe('Quiche'));
    await iphone.sync.sync();
    await ipad.sync.sync();
    iphone.online = false;
    ipad.online = false;
    await iphone.repos.updateRecipe(r.id, { servings: 8 });
    await ipad.repos.updateRecipe(r.id, { title: 'Quiche lorraine', tips: 'Pâte maison' });
    iphone.online = true;
    ipad.online = true;
    await iphone.sync.sync();
    await ipad.sync.sync();
    await iphone.sync.sync();
    for (const d of [iphone, ipad]) {
      expect(d.repos.recipe(r.id)!.data).toMatchObject({ title: 'Quiche lorraine', servings: 8, tips: 'Pâte maison' });
      expect(d.repos.recipe(r.id)!.state).toBe('synced');
    }
  });

  it('pull while a local edit is pending: the local edit is rebased, not lost', async () => {
    const [iphone, ipad] = await pair();
    const r = await iphone.repos.createRecipe(recipe('Soupe'));
    await iphone.sync.sync();
    await ipad.sync.sync();
    await iphone.repos.updateRecipe(r.id, { notes: 'iPhone note' });
    await iphone.sync.sync();
    ipad.online = false;
    await ipad.repos.updateRecipe(r.id, { tips: 'iPad tip' });
    ipad.online = true;
    // Pull applies first (simulate by pulling without pushing): use applyPulled via a push-less sync order.
    const page = await ipad.api.pull(Number(await ipad.store.meta('cursor')));
    await ipad.store.applyPulled(page.records, page.cursor);
    expect(ipad.repos.recipe(r.id)!.data).toMatchObject({ notes: 'iPhone note', tips: 'iPad tip' });
    expect(ipad.repos.recipe(r.id)!.state).toBe('pending');
    await ipad.sync.sync();
    await iphone.sync.sync();
    expect(iphone.repos.recipe(r.id)!.data).toMatchObject({ notes: 'iPhone note', tips: 'iPad tip' });
  });

  it('deleted on one device while being edited on the other → disappears cleanly', async () => {
    const [iphone, ipad] = await pair();
    const r = await iphone.repos.createRecipe(recipe('Éphémère'));
    await iphone.sync.sync();
    await ipad.sync.sync();
    await iphone.repos.deleteRecipe(r.id);
    await iphone.sync.sync();
    await ipad.repos.updateRecipe(r.id, { title: 'Modifiée' });
    await ipad.sync.sync();
    expect(ipad.repos.recipe(r.id)).toBeNull();
    expect(await ipad.store.pendingCount()).toBe(0);
  });

  it('checking shopping items on two phones at the same time converges', async () => {
    const [iphone, ipad] = await pair();
    const list = await iphone.repos.createList('Semaine');
    const items = [];
    for (const t of ['lait', 'pain', 'oeufs', 'tomates']) items.push(await iphone.repos.addItemText(list.id, t));
    await iphone.sync.sync();
    await ipad.sync.sync();
    await iphone.repos.toggleItem(items[0]!.id);
    await iphone.repos.toggleItem(items[1]!.id);
    await ipad.repos.toggleItem(items[2]!.id);
    await ipad.repos.updateItem(items[1]!.id, { quantity: 2 });
    await Promise.all([iphone.sync.sync(), ipad.sync.sync()]);
    await Promise.all([iphone.sync.sync(), ipad.sync.sync()]);
    for (const d of [iphone, ipad]) {
      const state = d.repos.items(list.id).map((i) => [i.data.name, i.data.checked, i.data.quantity]).sort();
      expect(state).toEqual([['lait', true, null], ['oeufs', true, null], ['pain', true, 2], ['tomates', false, null]]);
    }
  });

  it('spam-tapping favorite on two devices ends in one consistent state', async () => {
    const [iphone, ipad] = await pair();
    const r = await iphone.repos.createRecipe(recipe('Tiramisu'));
    await iphone.sync.sync();
    await ipad.sync.sync();
    for (let i = 0; i < 7; i++) await iphone.repos.toggleFavorite(r.id);
    await ipad.repos.toggleFavorite(r.id);
    await iphone.sync.sync();
    await ipad.sync.sync();
    await iphone.sync.sync();
    expect(iphone.repos.isFavorite(r.id)).toBe(ipad.repos.isFavorite(r.id));
    expect(iphone.store.all('favorite').filter((f) => f.id === favoriteId(iphone.userId, r.id)).length).toBeLessThanOrEqual(1);
  });
});

describe('resilience', () => {
  it('app killed in the middle of a sync: relaunch resumes without duplicates or loss', async () => {
    const [iphone, ipad] = await pair();
    await iphone.repos.createRecipe(recipe('Avant crash'));
    // Ops taken (in flight) but the app dies before the server answers.
    await iphone.store.takeOps(100);
    iphone.kill();
    await iphone.boot();
    expect(await iphone.store.pendingCount()).toBe(1);
    await iphone.sync.sync();
    await iphone.sync.sync();
    await ipad.sync.sync();
    expect(ipad.repos.library().filter((r) => r.data.title === 'Avant crash')).toHaveLength(1);
  });

  it('killed after the server applied the op but before the reply: replay is idempotent', async () => {
    const [iphone, ipad] = await pair();
    await iphone.repos.createRecipe(recipe('Idempotent'));
    const ops = await iphone.store.takeOps(100);
    await iphone.api.push(ops.map(({ seq: _s, attempts: _a, ...o }) => o)); // server applied it
    iphone.kill();
    await iphone.boot();
    await iphone.sync.sync();
    await ipad.sync.sync();
    expect(ipad.repos.library().filter((r) => r.data.title === 'Idempotent')).toHaveLength(1);
    expect(iphone.repos.library().find((r) => r.data.title === 'Idempotent')!.state).toBe('synced');
  });

  it('server down → error state, data kept, recovers', async () => {
    const [iphone] = await pair();
    await iphone.repos.createRecipe(recipe('Pendant la panne'));
    iphone.failServer = true;
    await iphone.sync.sync();
    expect(iphone.sync.snapshot).toMatchObject({ status: 'error', error: 'sync_failed' });
    expect(await iphone.store.pendingCount()).toBe(1);
    iphone.failServer = false;
    await iphone.sync.sync();
    expect(iphone.sync.snapshot.status).toBe('idle');
    expect(await iphone.store.pendingCount()).toBe(0);
  });

  it('expired access token is refreshed transparently', async () => {
    const [iphone] = await pair();
    const t = (await iphone.tokens.get())!;
    await iphone.tokens.set({ ...t, accessToken: 'expired.or.garbage' });
    await iphone.repos.createRecipe(recipe('Après expiration'));
    await iphone.sync.sync();
    expect(iphone.sync.snapshot.status).toBe('idle');
    expect((await iphone.tokens.get())!.refreshToken).not.toBe(t.refreshToken);
  });

  it('session revoked from another device → signed out, local data untouched until the user decides', async () => {
    const [iphone, ipad] = await pair();
    await ipad.api.revokeOtherSessions();
    await iphone.repos.createRecipe(recipe('Hors session'));
    await iphone.sync.sync();
    expect(iphone.sync.snapshot.status).toBe('signedOut');
    expect(iphone.signedOut).toBe(true);
    expect(await iphone.store.pendingCount()).toBe(1);
  });

  it('invalid data is refused locally with field errors', async () => {
    const [iphone] = await pair();
    await expect(iphone.repos.createRecipe({ ...emptyRecipe(), title: '' })).rejects.toBeInstanceOf(ValidationError);
    await expect(iphone.repos.createRecipe({ ...emptyRecipe(), title: 'x', servings: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(iphone.repos.planMeal({ date: '2026-10-01', slot: 'dinner' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('household', () => {
  it('joining shows the shared list and planning; leaving removes them', async () => {
    const hugo = await Device.create(server, 'hugo');
    const julie = await Device.create(server, 'julie');
    await hugo.signUp(email(), 'Hugo');
    await julie.signUp(email(), 'Julie');
    const h = (await hugo.api.createHousehold('Maison Busquet')).household;
    hugo.householdId = h.id;
    await hugo.sync.sync();
    await julie.sync.sync();
    const { code } = await hugo.api.inviteToHousehold();
    await julie.api.joinHousehold(code);
    julie.householdId = h.id;
    const list = await hugo.repos.createList('Courses du foyer');
    await hugo.repos.addItemText(list.id, '1 l de lait');
    const r = await hugo.repos.createRecipe(recipe('Gratin'));
    await hugo.repos.planMeal({ date: '2026-10-10', slot: 'lunch', recipeId: r.id });
    await hugo.repos.updateRecipe(r.id, { householdId: h.id });
    await hugo.sync.sync();
    await julie.sync.sync();
    expect(julie.repos.lists().map((l) => l.data.name)).toContain('Courses du foyer');
    expect(julie.repos.entries('2026-10-10', '2026-10-10')).toHaveLength(1);
    expect(julie.repos.library().map((x) => x.data.title)).toContain('Gratin');
    await julie.repos.addItemText(list.id, 'beurre');
    await julie.sync.sync();
    await hugo.sync.sync();
    expect(hugo.repos.items(list.id).map((i) => i.data.name).sort()).toEqual(['beurre', 'lait']);

    await julie.api.leaveHousehold();
    julie.householdId = null;
    await julie.sync.sync();
    expect(julie.repos.lists().map((l) => l.data.name)).not.toContain('Courses du foyer');
    expect(julie.repos.library().map((x) => x.data.title)).not.toContain('Gratin');
  });
});

describe('photos', () => {
  it('photo added offline is shown locally, uploaded later, then synced to other devices', async () => {
    const [iphone, ipad] = await pair();
    const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'photo-')), 'p.jpg');
    await fs.writeFile(file, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000, 1)]));
    iphone.online = false;
    const r = await iphone.repos.createRecipe(recipe('Avec photo'));
    await iphone.store.queuePhoto({ localUri: file, recipeId: r.id, contentType: 'image/jpeg', size: 5004 });
    expect(iphone.store.localPhoto(r.id)!.localUri).toBe(file);
    await iphone.photos.run();
    expect(iphone.store.localPhoto(r.id)).toMatchObject({ state: 'pending', lastError: 'offline' });
    iphone.online = true;
    await iphone.photos.run();
    expect(iphone.store.localPhoto(r.id)).toBeNull();
    const key = iphone.repos.recipe(r.id)!.data.photoKey;
    expect(key).toMatch(/^u\/.+\.jpg$/);
    await iphone.sync.sync();
    await ipad.sync.sync();
    expect(ipad.repos.recipe(r.id)!.data.photoKey).toBe(key);
  });

  it('corrupt image is rejected permanently without blocking the recipe', async () => {
    const [iphone] = await pair();
    const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'photo-')), 'bad.jpg');
    await fs.writeFile(file, 'not an image at all');
    const r = await iphone.repos.createRecipe(recipe('Photo cassée'));
    await iphone.store.queuePhoto({ localUri: file, recipeId: r.id, contentType: 'image/jpeg', size: 19 });
    await iphone.photos.run();
    expect(iphone.store.localPhoto(r.id)).toMatchObject({ state: 'error' });
    await iphone.sync.sync();
    expect(iphone.repos.recipe(r.id)!.state).toBe('synced');
  });
});

describe('shopping from planning', () => {
  it('generates a merged, scaled, aisle-sorted list from the week plan', async () => {
    const [iphone] = await pair();
    const crepes = await iphone.repos.createRecipe({
      ...emptyRecipe(4),
      title: 'Crêpes',
      servings: 4,
      ingredients: [
        { id: crypto.randomUUID(), group: null, name: 'farine', quantity: 250, quantityMax: null, unit: 'g', note: null },
        { id: crypto.randomUUID(), group: null, name: 'oeufs', quantity: 4, quantityMax: null, unit: null, note: null },
        { id: crypto.randomUUID(), group: null, name: 'lait', quantity: 50, quantityMax: null, unit: 'cl', note: null },
      ],
    });
    const gateau = await iphone.repos.createRecipe(recipeFromDraft(parseRecipeText('Gâteau\nPour 8 personnes\nIngrédients\n500 g de farine\n3 oeufs\nPréparation\n1. Mélanger.')));
    await iphone.repos.planMeal({ date: '2026-10-12', slot: 'breakfast', recipeId: crepes.id, servings: 8 });
    await iphone.repos.planMeal({ date: '2026-10-14', slot: 'snack', recipeId: gateau.id });
    await iphone.repos.planMeal({ date: '2026-10-20', slot: 'dinner', recipeId: gateau.id }); // next week: excluded
    const list = await iphone.repos.createList('Semaine');
    await iphone.repos.addItemText(list.id, '200 g de farine');
    const res = await iphone.repos.addPlanToList(list.id, '2026-10-12', '2026-10-18');
    expect(res).toEqual({ added: 2, updated: 1 });
    const byName = Object.fromEntries(iphone.repos.items(list.id).map((i) => [i.data.name.toLowerCase(), i.data]));
    expect(byName['farine']).toMatchObject({ quantity: 1.2, unit: 'kg', categoryKey: 'pantry' });
    expect(byName['oeufs']).toMatchObject({ quantity: 11, categoryKey: 'dairy_eggs' });
    expect(byName['lait']).toMatchObject({ quantity: 1, unit: 'l' });
  });
});
