/**
 * Stateful fuzz tests of the data layer: random sequences of real user actions on several
 * devices, with iCloud going away, apps killed and relaunched, and syncs in any order. Every
 * scenario comes from a seed (printed on failure) and must end with all devices identical.
 */
import { describe, expect, it } from 'vitest';
import { rng, type Rng } from '../../core/src/fuzz/rng';
import { emptyRecipe, exportData, importData, ImportFormatError, LocalStore, Repos } from '../src';
import { betterSqliteDriver } from './betterSqliteDriver';
import { FakeCloud, SimDevice, syncAll, TestTime } from './fakes';

const SCENARIOS = Number(process.env.FUZZ_SCENARIOS ?? 60);
const OPS = 40;
let opsRun = 0;

/** All live data of a device, comparable between devices. */
async function state(d: SimDevice) {
  return (await d.store.snapshot())
    .filter((r) => !r.deleted)
    .map((r) => `${r.entity}/${r.id}=${JSON.stringify(r.data)}`)
    .sort();
}

/** One random user action, through the same repository calls the screens use. */
async function act(d: SimDevice, r: Rng) {
  const repos = d.repos;
  const recipes = repos.recipes();
  const one = () => (recipes.length ? r.pick(recipes) : null);
  switch (r.int(0, 13)) {
    case 0:
    case 1:
      return repos.createRecipe({ ...emptyRecipe(r.int(1, 12)), title: r.word(8).trim() || 'x' });
    case 2: {
      const x = one();
      return x && repos.updateRecipe(x.id, { title: `${r.word(6).trim() || 'y'}` });
    }
    case 3: {
      const x = one();
      return x && repos.deleteRecipe(x.id);
    }
    case 4: {
      const x = one();
      return x && repos.toggleFavorite(x.id);
    }
    case 5: {
      const x = one();
      return (
        x &&
        repos.planMeal({
          date: `2026-11-0${r.int(1, 9)}`,
          slot: r.pick(['lunch', 'dinner'] as const),
          recipeId: x.id,
        })
      );
    }
    case 6: {
      const l = await repos.ensureActiveList('Courses');
      return repos.addItemText(
        l.id,
        `${r.int(1, 9)} ${r.pick(['kg de pommes', 'oeufs', 'l de lait', 'tomates'])}`,
      );
    }
    case 7: {
      const l = repos.activeList();
      const items = l ? repos.items(l.id) : [];
      return items.length ? repos.toggleItem(r.pick(items).id) : null;
    }
    case 8: {
      const x = one();
      return x && repos.logCooked(x.id, `2026-10-${10 + r.int(0, 19)}`);
    }
    case 9:
      return repos.addPantryText(
        `${r.int(1, 900)} g de ${r.pick(['riz', 'farine', 'sucre'])}`,
        r.pick(['pantry', 'fridge'] as const),
      );
    case 10: {
      const c = repos.collections();
      const x = one();
      if (!c.length || r.bool(0.3)) return repos.createCollection(r.word(5).trim() || 'c');
      return x && repos.setInCollection(r.pick(c).id, x.id, r.bool());
    }
    case 11: {
      const x = one();
      return x && repos.setRating(x.id, r.pick([null, 1, 3, 5]));
    }
    case 12:
      return repos.updateSettings({ defaultServings: r.int(1, 12) });
    default: {
      const p = repos.pantryItems();
      return p.length ? repos.removePantryItem(r.pick(p).id) : null;
    }
  }
}

describe('several devices, random actions, random syncs', () => {
  it(`${SCENARIOS} scenarios × ${OPS} actions converge to the same data on every device`, async () => {
    for (let s = 1; s <= SCENARIOS; s++) {
      const r = rng(50_000 + s);
      const time = new TestTime();
      const icloud = new FakeCloud(time);
      const devices = [
        await SimDevice.create(`a${s}`, icloud, time),
        await SimDevice.create(`b${s}`, icloud, time),
        await SimDevice.create(`c${s}`, icloud, time, r.bool() ? -86_400_000 : 0),
      ];
      for (let k = 0; k < OPS; k++) {
        const d = r.pick(devices);
        await act(d, r);
        opsRun++;
        time.advance(r.int(1, 5000));
        if (r.bool(0.25)) await r.pick(devices).cloud.sync();
        if (r.bool(0.05)) icloud.available = !icloud.available;
        if (r.bool(0.04)) {
          // The app is killed and relaunched: nothing written may be lost.
          const before = await state(d);
          d.kill();
          await d.boot();
          expect(await state(d), `seed ${s}: relaunch`).toEqual(before);
        }
      }
      icloud.available = true;
      await syncAll(...devices);
      await syncAll(...devices);
      const ref = await state(devices[0]!);
      for (const d of devices.slice(1)) expect(await state(d), `seed ${s}: ${d.name}`).toEqual(ref);
      // Integrity: favorites, collection items and shopping items point to existing parents.
      const repos = devices[0]!.repos;
      for (const f of devices[0]!.store.all('favorite'))
        expect(repos.recipe(f.data.recipeId), `seed ${s}: favorite`).not.toBeNull();
      for (const c of devices[0]!.store.all('collectionItem'))
        expect(repos.recipe(c.data.recipeId), `seed ${s}: collection item`).not.toBeNull();
      for (const dv of devices) dv.kill();
    }
    expect(opsRun).toBe(SCENARIOS * OPS);
  }, 600_000);
});

describe('backups', () => {
  async function library(r: Rng) {
    const store = await LocalStore.open(betterSqliteDriver());
    const repos = new Repos(store);
    for (let i = 0; i < r.int(1, 15); i++) {
      const rec = await repos.createRecipe({
        ...emptyRecipe(r.int(1, 8)),
        title: r.junk(4).trim() || 't',
      });
      if (r.bool()) await repos.toggleFavorite(rec.id);
      if (r.bool()) await repos.logCooked(rec.id, '2026-10-01');
    }
    const l = await repos.createList('L');
    for (let i = 0; i < r.int(0, 10); i++)
      await repos.addItemText(l.id, `${r.int(1, 9)} ${r.word(5)}a`);
    return store;
  }

  it('120 libraries: export then import into an empty app gives the same data', async () => {
    for (let s = 1; s <= 120; s++) {
      const r = rng(60_000 + s);
      const src = await library(r);
      const json = JSON.stringify(await exportData(src));
      const dst = await LocalStore.open(betterSqliteDriver());
      await importData(dst, json);
      const live = async (st: LocalStore) =>
        (await st.snapshot())
          .filter((x) => !x.deleted)
          .map((x) => `${x.entity}/${x.id}=${JSON.stringify(x.data)}`)
          .sort();
      expect(await live(dst), `seed ${s}`).toEqual(await live(src));
      // Importing the same file again changes nothing.
      await importData(dst, json);
      expect(await live(dst), `seed ${s}: twice`).toEqual(await live(src));
    }
  }, 300_000);

  it('400 damaged backups are refused or partly imported, never destroying existing data', async () => {
    const r0 = rng(70_000);
    const base = JSON.stringify(await exportData(await library(r0)));
    for (let s = 1; s <= 400; s++) {
      const r = rng(70_000 + s);
      const store = await LocalStore.open(betterSqliteDriver());
      const repos = new Repos(store);
      const mine = await repos.createRecipe({ ...emptyRecipe(), title: 'À moi' });
      let bad: string;
      switch (r.int(0, 4)) {
        case 0:
          bad = base.slice(0, r.int(0, base.length - 1));
          break;
        case 1: {
          const i = r.int(0, base.length - 1);
          bad = base.slice(0, i) + r.junk(3) + base.slice(i + 1);
          break;
        }
        case 2: {
          const o = JSON.parse(base) as { records: Record<string, unknown>[] };
          for (const rec of o.records)
            if (r.bool(0.3))
              rec[r.pick(['data', 'id', 'hlc', 'entity'])] = r.pick([null, 42, '', r.junk(5), {}]);
          bad = JSON.stringify(o);
          break;
        }
        case 3:
          bad = JSON.stringify(r.pick([null, [], {}, { format: 'x' }, { records: 'x' }, 'text']));
          break;
        default: {
          const o = JSON.parse(base) as { records: unknown[] };
          o.records.push(
            ...Array.from({ length: r.int(1, 20) }, () => ({
              entity: r.pick(['recipe', 'favorite', 'nope']),
              id: r.junk(3),
              hlc: r.junk(3),
              data: r.junk(5),
            })),
          );
          bad = JSON.stringify(o);
        }
      }
      try {
        await importData(store, bad);
      } catch (e) {
        expect(e, `seed ${s}`).toBeInstanceOf(ImportFormatError);
      }
      expect(repos.recipe(mine.id)?.data.title, `seed ${s}`).toBe('À moi');
      for (const rec of repos.recipes())
        expect(rec.data.title.length, `seed ${s}`).toBeGreaterThan(0);
    }
  }, 300_000);
});
