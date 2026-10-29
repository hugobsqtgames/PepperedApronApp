import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { favoriteId, SETTINGS_ID, uuidv7 } from '@pepperedapron/core';
import { emptyRecipe, formatHlc, LocalStore, Repos, ValidationError } from '../src';
import { betterSqliteDriver } from './betterSqliteDriver';

async function open(file = ':memory:') {
  const driver = betterSqliteDriver(file);
  const store = await LocalStore.open(driver);
  return { driver, store, repos: new Repos(store) };
}

describe('local store (everything on the device)', () => {
  it('persists across app restarts, with a stable device id and revision', async () => {
    const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'pa-store-')), 'db.sqlite');
    const a = await open(file);
    const r = await a.repos.createRecipe({ ...emptyRecipe(), title: 'Tarte' });
    await a.repos.toggleFavorite(r.id);
    const { deviceId, revision } = a.store;
    a.driver.close();
    const b = await open(file);
    expect(b.store.deviceId).toBe(deviceId);
    expect(b.store.revision).toBe(revision);
    expect(b.repos.recipe(r.id)?.data.title).toBe('Tarte');
    expect(b.repos.isFavorite(r.id)).toBe(true);
    // Later changes still sort after the earlier ones.
    const r2 = await b.repos.updateRecipe(r.id, { title: 'Tarte fine' });
    expect(r2.hlc > r.hlc).toBe(true);
  });

  it('notifies subscribers and skips writes that change nothing', async () => {
    const { store, repos } = await open();
    const seen: string[][] = [];
    store.subscribe((s) => seen.push([...s]));
    const r = await repos.createRecipe({ ...emptyRecipe(), title: 'Soupe' });
    const rev = store.revision;
    const same = await repos.updateRecipe(r.id, { title: 'Soupe' });
    expect(same.hlc).toBe(r.hlc);
    expect(store.revision).toBe(rev);
    expect(seen).toEqual([['recipe']]);
  });

  it('keeps tombstones so deletions can reach other devices', async () => {
    const { store, repos } = await open();
    const r = await repos.createRecipe({ ...emptyRecipe(), title: 'X' });
    await repos.deleteRecipe(r.id);
    expect(repos.recipe(r.id)).toBeNull();
    const snap = await store.snapshot();
    expect(snap).toEqual([expect.objectContaining({ id: r.id, deleted: true, data: null })]);
    // Deleting twice is harmless.
    await repos.deleteRecipe(r.id);
    expect((await store.snapshot()).length).toBe(1);
  });

  it('validates input with friendly codes', async () => {
    const { repos } = await open();
    await expect(repos.createRecipe({ ...emptyRecipe(), title: '   ' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(repos.updateSettings({ defaultServings: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('stores settings in one record shared by all devices', async () => {
    const { store, repos } = await open();
    expect(repos.settings().onboardingDone).toBe(false);
    await repos.updateSettings({ onboardingDone: true, theme: 'dark' });
    expect(store.get('settings', SETTINGS_ID)?.data).toMatchObject({ theme: 'dark' });
  });

  it('deleting a recipe cleans favorites and collections and keeps planned meals', async () => {
    const { repos } = await open();
    const r = await repos.createRecipe({ ...emptyRecipe(), title: 'Lasagnes' });
    await repos.toggleFavorite(r.id);
    const c = await repos.createCollection('Hiver');
    await repos.setInCollection(c.id, r.id, true);
    const meal = await repos.planMeal({ date: '2026-10-01', slot: 'dinner', recipeId: r.id });
    await repos.deleteRecipe(r.id);
    expect(repos.favoriteRecipes()).toEqual([]);
    expect(repos.collectionRecipes(c.id)).toEqual([]);
    expect(repos.entries('2026-10-01', '2026-10-01')[0]).toMatchObject({
      id: meal.id,
      data: { recipeId: null, customTitle: 'Lasagnes' },
    });
  });

  it('favorite ids are deterministic so double taps and two devices never duplicate', async () => {
    const { store, repos } = await open();
    const r = await repos.createRecipe({ ...emptyRecipe(), title: 'Crêpes' });
    await Promise.all(Array.from({ length: 20 }, () => repos.toggleFavorite(r.id)));
    expect(store.all('favorite').length).toBeLessThanOrEqual(1);
    expect(store.all('favorite').every((f) => f.id === favoriteId(r.id))).toBe(true);
  });

  it('merge: the latest change wins, deletions included, invalid records are ignored', async () => {
    const { store, repos } = await open();
    const r = await repos.createRecipe({ ...emptyRecipe(), title: 'Mine' });
    const older = formatHlc(1, 0, 'other');
    const newer = formatHlc(Date.now() + 60_000, 0, 'other');
    const data = { ...r.data, title: 'Theirs' };
    expect(
      await store.merge([{ entity: 'recipe', id: r.id, hlc: older, deleted: false, data }]),
    ).toBe(0);
    expect(repos.recipe(r.id)?.data.title).toBe('Mine');
    const fresh = uuidv7();
    const applied = await store.merge([
      { entity: 'recipe', id: r.id, hlc: newer, deleted: false, data },
      { entity: 'recipe', id: fresh, hlc: newer, deleted: false, data: { ...data, title: '' } },
      { entity: 'nope', id: fresh, hlc: newer, deleted: false, data },
      { entity: 'recipe', id: fresh, hlc: 'bad', deleted: false, data },
      null,
      'x',
    ]);
    expect(applied).toBe(1);
    expect(repos.recipe(r.id)?.data.title).toBe('Theirs');
    expect(repos.recipe(fresh)).toBeNull();
    // A local edit after the merge sorts after what was received.
    const mine = await repos.updateRecipe(r.id, { title: 'Mine again' });
    expect(mine.hlc > newer).toBe(true);
    await store.merge([
      {
        entity: 'recipe',
        id: r.id,
        hlc: formatHlc(Date.now() + 120_000, 0, 'other'),
        deleted: true,
        data: null,
      },
    ]);
    expect(repos.recipe(r.id)).toBeNull();
  });

  it('delete all data turns every record into a tombstone', async () => {
    const { store, repos } = await open();
    const r = await repos.createRecipe({ ...emptyRecipe(), title: 'A' });
    await repos.createList('Courses');
    await repos.toggleFavorite(r.id);
    await repos.updateSettings({ theme: 'dark' });
    await store.removeAll(['settings']);
    expect(store.count()).toBe(1);
    expect(repos.settings().theme).toBe('dark');
    await store.removeAll();
    expect(store.count()).toBe(0);
    expect((await store.snapshot()).every((x) => x.deleted)).toBe(true);
  });
});
