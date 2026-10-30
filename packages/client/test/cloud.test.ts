import { beforeEach, describe, expect, it } from 'vitest';
import { emptyRecipe, exportData, importData, ImportFormatError, removeOrphanPhotos } from '../src';
import { FakeCloud, SimDevice, syncAll, TestTime } from './fakes';

const photo = (n: number) => `0190a6f2-0000-7000-8000-${String(n).padStart(12, '0')}.jpg`;

let time: TestTime;
let icloud: FakeCloud;
let iphone: SimDevice;
let ipad: SimDevice;

beforeEach(async () => {
  time = new TestTime();
  icloud = new FakeCloud(time);
  iphone = await SimDevice.create('iphone', icloud, time);
  ipad = await SimDevice.create('ipad', icloud, time);
});

const recipe = (title: string) => ({ ...emptyRecipe(), title });

describe('iCloud sync between the devices of one user (no server)', () => {
  it('a recipe created on the iPhone appears on the iPad, and back', async () => {
    const r = await iphone.repos.createRecipe(recipe('Tarte tatin'));
    await syncAll(iphone, ipad);
    expect(ipad.repos.recipe(r.id)?.data.title).toBe('Tarte tatin');
    await ipad.repos.updateRecipe(r.id, { servings: 8 });
    time.advance();
    await syncAll(ipad, iphone);
    expect(iphone.repos.recipe(r.id)?.data.servings).toBe(8);
    expect(iphone.cloud.snapshot.status).toBe('idle');
    expect(iphone.changes).toBeGreaterThan(0);
    // Each device writes only its own file.
    expect([...icloud.files.keys()].sort()).toEqual(
      [`devices/${ipad.store.deviceId}.json`, `devices/${iphone.store.deviceId}.json`].sort(),
    );
  });

  it('works fully offline and catches up when iCloud is back', async () => {
    icloud.available = false;
    const r = await iphone.repos.createRecipe(recipe('Gratin'));
    await iphone.cloud.sync();
    expect(iphone.cloud.snapshot.status).toBe('unavailable');
    expect(iphone.repos.recipe(r.id)).not.toBeNull();
    icloud.available = true;
    await syncAll(iphone, ipad);
    expect(ipad.repos.recipe(r.id)?.data.title).toBe('Gratin');
  });

  it('concurrent edits of the same recipe: the latest one wins on both devices', async () => {
    const r = await iphone.repos.createRecipe(recipe('Soupe'));
    await syncAll(iphone, ipad);
    await iphone.repos.updateRecipe(r.id, { title: 'Soupe (iPhone)' });
    time.advance(5_000);
    await ipad.repos.updateRecipe(r.id, { title: 'Soupe (iPad)' });
    await syncAll(iphone, ipad);
    expect(iphone.repos.recipe(r.id)?.data.title).toBe('Soupe (iPad)');
    expect(ipad.repos.recipe(r.id)?.data.title).toBe('Soupe (iPad)');
  });

  it('a device with a wrong date in the past cannot lose later edits', async () => {
    const late = await SimDevice.create('old-phone', icloud, time, -86_400_000 * 365);
    const r = await iphone.repos.createRecipe(recipe('Pizza'));
    await syncAll(iphone, late);
    await late.repos.updateRecipe(r.id, { title: 'Pizza maison' });
    await syncAll(late, iphone);
    expect(iphone.repos.recipe(r.id)?.data.title).toBe('Pizza maison');
  });

  it('a deletion is never undone by an older copy on another device', async () => {
    const r = await iphone.repos.createRecipe(recipe('Quiche'));
    await iphone.repos.toggleFavorite(r.id);
    await syncAll(iphone, ipad);
    time.advance();
    await iphone.repos.deleteRecipe(r.id);
    await syncAll(iphone, ipad);
    expect(ipad.repos.recipe(r.id)).toBeNull();
    expect(ipad.repos.favoriteRecipes()).toEqual([]);
    // A third device restored from an old backup still has the recipe: it must disappear too.
    const old = await SimDevice.create('restored', icloud, time);
    await old.store.merge(
      JSON.parse(icloud.files.get(`devices/${ipad.store.deviceId}.json`)!.content).records.map(
        (x: { deleted: boolean }) => x,
      ),
    );
    await syncAll(old, iphone, ipad);
    expect(old.repos.recipe(r.id)).toBeNull();
    expect(iphone.repos.recipe(r.id)).toBeNull();
  });

  it('edit on one device after a delete on the other: the latest action wins', async () => {
    const r = await iphone.repos.createRecipe(recipe('Cake'));
    await syncAll(iphone, ipad);
    await iphone.repos.deleteRecipe(r.id);
    time.advance(10_000);
    await ipad.repos.updateRecipe(r.id, { title: 'Cake au citron' });
    await syncAll(iphone, ipad);
    expect(iphone.repos.recipe(r.id)?.data.title).toBe('Cake au citron');
    expect(ipad.repos.recipe(r.id)?.data.title).toBe('Cake au citron');
  });

  it('favorite on both devices offline gives one favorite, shopping items merge', async () => {
    const r = await iphone.repos.createRecipe(recipe('Crêpes'));
    const list = await iphone.repos.createList('Courses');
    await syncAll(iphone, ipad);
    await iphone.repos.toggleFavorite(r.id);
    await ipad.repos.toggleFavorite(r.id);
    await iphone.repos.addItemText(list.id, '1 l de lait');
    await ipad.repos.addItemText(list.id, '6 œufs');
    await syncAll(iphone, ipad);
    for (const d of [iphone, ipad]) {
      expect(d.store.all('favorite')).toHaveLength(1);
      expect(
        d.repos
          .items(list.id)
          .map((i) => i.data.name)
          .sort(),
      ).toEqual(['lait', 'œufs']);
    }
    const milk = ipad.repos.items(list.id).find((i) => i.data.name === 'lait')!;
    await ipad.repos.toggleItem(milk.id);
    await syncAll(ipad, iphone);
    expect(iphone.repos.items(list.id).find((i) => i.id === milk.id)?.data.checked).toBe(true);
  });

  it('a new device signed in to the same iCloud gets everything', async () => {
    const r = await iphone.repos.createRecipe(recipe('Ratatouille'));
    await iphone.repos.planMeal({ date: '2026-10-02', slot: 'dinner', recipeId: r.id });
    await iphone.repos.updateSettings({ defaultServings: 2, onboardingDone: true });
    await iphone.cloud.sync();
    const mac = await SimDevice.create('new-ipad', icloud, time);
    await mac.cloud.sync();
    expect(mac.repos.recipe(r.id)).not.toBeNull();
    expect(mac.repos.entries('2026-10-02', '2026-10-02')).toHaveLength(1);
    expect(mac.repos.settings()).toMatchObject({ defaultServings: 2, onboardingDone: true });
  });

  it('only rewrites its file when something changed, and skips unchanged files', async () => {
    await iphone.repos.createRecipe(recipe('A'));
    await syncAll(iphone, ipad);
    const before = new Map([...icloud.files].map(([k, v]) => [k, v.modifiedAt]));
    time.advance();
    await syncAll(iphone, ipad);
    expect(new Map([...icloud.files].map(([k, v]) => [k, v.modifiedAt]))).toEqual(before);
  });

  it('a file being written or downloaded is retried later; nothing is lost', async () => {
    const r = await iphone.repos.createRecipe(recipe('Tajine'));
    await iphone.cloud.sync();
    const path = `devices/${iphone.store.deviceId}.json`;
    icloud.unreadable.add(path);
    await ipad.cloud.sync();
    expect(ipad.repos.recipe(r.id)).toBeNull();
    icloud.unreadable.delete(path);
    await ipad.cloud.sync();
    expect(ipad.repos.recipe(r.id)).not.toBeNull();
    // Truncated JSON (device killed mid-write) behaves the same.
    icloud.files.set(path, {
      content: '{"format":"pepperedapron-sync/1","rec',
      modifiedAt: time.ms + 1,
    });
    await ipad.cloud.sync();
    expect(ipad.cloud.snapshot.status).toBe('idle');
  });

  it('ignores files written by a newer app version', async () => {
    icloud.files.set('devices/future.json', {
      content: JSON.stringify({ format: 'pepperedapron-sync/9', records: [{ any: 'thing' }] }),
      modifiedAt: time.ms,
    });
    await iphone.repos.createRecipe(recipe('B'));
    await iphone.cloud.sync();
    expect(iphone.cloud.snapshot.status).toBe('idle');
    expect(iphone.store.all('recipe')).toHaveLength(1);
  });

  it('an upload interrupted (app killed) is redone at the next launch', async () => {
    const r = await iphone.repos.createRecipe(recipe('Paella'));
    iphone.failWrites = true;
    await iphone.cloud.sync();
    expect(iphone.cloud.snapshot.status).toBe('error');
    iphone.kill();
    await iphone.boot();
    iphone.failWrites = false;
    await syncAll(iphone, ipad);
    expect(ipad.repos.recipe(r.id)?.data.title).toBe('Paella');
  });

  it('concurrent sync requests run one at a time and none is lost', async () => {
    await iphone.repos.createRecipe(recipe('1'));
    const runs = [iphone.cloud.sync(), iphone.cloud.sync(), iphone.cloud.sync()];
    await iphone.repos.createRecipe(recipe('2'));
    await Promise.all(runs);
    await iphone.cloud.sync();
    await ipad.cloud.sync();
    expect(ipad.store.all('recipe')).toHaveLength(2);
  });

  it('does nothing when the user turned iCloud sync off on this device', async () => {
    iphone.cloudEnabled = false;
    await iphone.repos.createRecipe(recipe('Secret'));
    await iphone.cloud.sync();
    expect(iphone.cloud.snapshot.status).toBe('off');
    expect(icloud.files.size).toBe(0);
  });

  it('delete all data on one device empties every device', async () => {
    await iphone.repos.createRecipe(recipe('A'));
    await iphone.repos.createList('L');
    await syncAll(iphone, ipad);
    time.advance();
    await ipad.store.removeAll();
    await syncAll(ipad, iphone);
    expect(iphone.store.count()).toBe(0);
  });
});

describe('photos through iCloud', () => {
  it('are uploaded before the recipe that uses them and downloaded by other devices', async () => {
    iphone.addPhoto(photo(1));
    const r = await iphone.repos.createRecipe({ ...recipe('Tarte'), photoKey: photo(1) });
    await syncAll(iphone, ipad);
    expect(icloud.files.has(`photos/${photo(1)}`)).toBe(true);
    expect(ipad.disk.get(`photos/${photo(1)}`)?.content).toBe(`jpeg:${photo(1)}`);
    expect(ipad.repos.recipe(r.id)?.data.photoKey).toBe(photo(1));
  });

  it('a photo still uploading from another device is fetched on a later run', async () => {
    iphone.addPhoto(photo(2));
    await iphone.repos.createRecipe({ ...recipe('Tarte'), photoKey: photo(2) });
    await iphone.cloud.sync();
    const saved = icloud.files.get(`photos/${photo(2)}`)!;
    icloud.files.delete(`photos/${photo(2)}`);
    await ipad.cloud.sync();
    expect(ipad.disk.has(`photos/${photo(2)}`)).toBe(false);
    expect(ipad.cloud.snapshot.status).toBe('idle');
    icloud.files.set(`photos/${photo(2)}`, saved);
    await ipad.cloud.sync();
    expect(ipad.disk.has(`photos/${photo(2)}`)).toBe(true);
  });

  it('replaced or deleted photos are cleaned up after a grace period, never before', async () => {
    iphone.addPhoto(photo(3));
    const r = await iphone.repos.createRecipe({ ...recipe('Tarte'), photoKey: photo(3) });
    await syncAll(iphone, ipad);
    iphone.addPhoto(photo(4));
    await iphone.repos.updateRecipe(r.id, { photoKey: photo(4) });
    // A photo picked in the editor but not saved yet must survive.
    iphone.addPhoto(photo(5));
    await syncAll(iphone, ipad);
    expect(icloud.files.has(`photos/${photo(3)}`)).toBe(true);
    expect(iphone.disk.has(`photos/${photo(5)}`)).toBe(true);
    time.advance(2 * 86_400_000);
    await syncAll(iphone, ipad);
    expect(icloud.files.has(`photos/${photo(3)}`)).toBe(false);
    expect(icloud.files.has(`photos/${photo(4)}`)).toBe(true);
    for (const d of [iphone, ipad]) {
      expect(d.disk.has(`photos/${photo(3)}`)).toBe(false);
      expect(d.disk.has(`photos/${photo(4)}`)).toBe(true);
    }
    expect(iphone.disk.has(`photos/${photo(5)}`)).toBe(false);
  });

  it('never deletes cloud photos while a device file could not be read', async () => {
    iphone.addPhoto(photo(6));
    await iphone.repos.createRecipe({ ...recipe('Tarte'), photoKey: photo(6) });
    await iphone.cloud.sync();
    icloud.unreadable.add(`devices/${iphone.store.deviceId}.json`);
    time.advance(3 * 86_400_000);
    await ipad.cloud.sync();
    expect(icloud.files.has(`photos/${photo(6)}`)).toBe(true);
  });

  it('a duplicated recipe shares the photo; deleting one recipe keeps it', async () => {
    iphone.addPhoto(photo(7));
    const r = await iphone.repos.createRecipe({ ...recipe('Tarte'), photoKey: photo(7) });
    const copy = await iphone.repos.duplicateRecipe(r.id, '(copie)');
    expect(copy.data.photoKey).toBe(photo(7));
    await iphone.repos.deleteRecipe(r.id);
    time.advance(2 * 86_400_000);
    expect(await removeOrphanPhotos(iphone.store, iphone.photos, 86_400_000, () => time.ms)).toBe(
      0,
    );
    await iphone.repos.deleteRecipe(copy.id);
    expect(await removeOrphanPhotos(iphone.store, iphone.photos, 86_400_000, () => time.ms)).toBe(
      1,
    );
  });
});

describe('export and import (backup, moving to a phone without iCloud)', () => {
  it('round-trips all data into a fresh device', async () => {
    const r = await iphone.repos.createRecipe(recipe('Couscous'));
    await iphone.repos.toggleFavorite(r.id);
    await iphone.repos.deleteRecipe((await iphone.repos.createRecipe(recipe('Gone'))).id);
    const json = JSON.stringify(await exportData(iphone.store, () => time.ms));
    expect(json).not.toContain('Gone');
    const newPhone = await SimDevice.create('new-phone', icloud, time);
    newPhone.cloudEnabled = false;
    expect(await importData(newPhone.store, json)).toBe(2);
    expect(newPhone.repos.favoriteRecipes().map((x) => x.data.title)).toEqual(['Couscous']);
    // Importing twice changes nothing.
    expect(await importData(newPhone.store, json)).toBe(0);
  });

  it('rejects files that are not a PepperedApron backup', async () => {
    for (const bad of ['', 'nope', '{}', '{"format":"other","records":[]}', '[]'])
      await expect(importData(iphone.store, bad)).rejects.toBeInstanceOf(ImportFormatError);
  });
});

describe('regressions found by the fuzz tests', () => {
  it('a recipe deleted on one device while favorited on the other leaves no orphan', async () => {
    const r = await iphone.repos.createRecipe(recipe('Clafoutis'));
    const col = await iphone.repos.createCollection('Desserts');
    await syncAll(iphone, ipad);
    await iphone.repos.deleteRecipe(r.id);
    await iphone.repos.deleteCollection(col.id);
    time.advance();
    // Meanwhile, offline on the iPad:
    await ipad.repos.toggleFavorite(r.id);
    await ipad.repos.logCooked(r.id, '2026-10-30');
    await ipad.repos.setInCollection(col.id, r.id, true);
    await syncAll(iphone, ipad);
    await syncAll(iphone, ipad);
    for (const d of [iphone, ipad]) {
      expect(d.store.all('favorite')).toEqual([]);
      expect(d.store.all('cookLog')).toEqual([]);
      expect(d.store.all('collectionItem')).toEqual([]);
    }
  });

  it('a list deleted on one device while an item is added on the other leaves no orphan item', async () => {
    const l = await iphone.repos.createList('Courses');
    await syncAll(iphone, ipad);
    await iphone.repos.deleteList(l.id);
    await ipad.repos.addItemText(l.id, '2 kg de pommes');
    await syncAll(iphone, ipad);
    await syncAll(iphone, ipad);
    for (const d of [iphone, ipad]) expect(d.store.all('shoppingItem')).toEqual([]);
  });

  it('a backup file that is only null, a number or a string is refused cleanly', async () => {
    for (const bad of ['null', '42', '"x"', 'true'])
      await expect(importData(iphone.store, bad)).rejects.toBeInstanceOf(ImportFormatError);
  });
});
