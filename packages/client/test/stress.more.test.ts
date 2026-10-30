/**
 * Stress in every direction on the data layer: thousands of concurrent writes, five devices
 * syncing at the same time, huge recipes, a year of planning, repeated backups, deleting all.
 * STRESS=1 multiplies the sizes. Counts are printed as "QA-COUNT".
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addDays, mergeKey, uuidv7 } from '@pepperedapron/core';
import { emptyRecipe, exportData, importData, LocalStore, Repos } from '../src';
import { rng } from '../../core/src/fuzz/rng';
import { betterSqliteDriver } from './betterSqliteDriver';
import { FakeCloud, SimDevice, syncAll, TestTime } from './fakes';

const SCALE = process.env.STRESS ? 5 : 1;
const live = async (st: LocalStore) =>
  (await st.snapshot())
    .filter((x) => !x.deleted)
    .map((x) => `${x.entity}/${x.id}=${JSON.stringify(x.data)}`)
    .sort();

describe('concurrency', () => {
  it(`${2000 * SCALE} operations fired at once on one database stay consistent and durable`, async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-conc-')), 'db.sqlite');
    const store = await LocalStore.open(betterSqliteDriver(file));
    const repos = new Repos(store);
    const r = rng(300_000);
    const seed = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        repos.createRecipe({ ...emptyRecipe(4), title: `R${i}` }),
      ),
    );
    const list = await repos.createList('Courses');
    const ops = Array.from({ length: 2000 * SCALE }, (_, k) => {
      const rec = r.pick(seed);
      switch (k % 7) {
        case 0:
          return repos.toggleFavorite(rec.id);
        case 1:
          return repos.updateRecipe(rec.id, { title: `R ${r.word(5)} ${k}` });
        case 2:
          return repos.addItemText(list.id, `${r.int(1, 9)} ${r.word(5)}x`);
        case 3:
          return repos.logCooked(rec.id, `2026-10-${10 + (k % 20)}`);
        case 4:
          return repos.addPantryText(`${r.int(1, 900)} g de ${r.pick(['riz', 'sucre'])}`);
        case 5:
          return repos.planMeal({
            date: addDays('2026-11-01', k % 60),
            slot: 'dinner',
            recipeId: rec.id,
          });
        default:
          return repos.setRating(rec.id, r.pick([null, 1, 5]));
      }
    });
    await Promise.all(ops);
    // Merged pantry: concurrent "500 g de riz" add up, never duplicated per unit.
    const keys = repos.pantryItems().map((p) => `${p.data.name}|${p.data.unit}|${p.data.place}`);
    expect(new Set(keys).size).toBe(keys.length);
    const favs = store.all('favorite').map((f) => f.data.recipeId);
    expect(new Set(favs).size).toBe(favs.length);
    const before = await live(store);
    const reopened = await LocalStore.open(betterSqliteDriver(file));
    expect(await live(reopened)).toEqual(before);
    console.info(`QA-COUNT client.concurrent.ops ${ops.length}`);
  }, 600_000);
});

describe('five devices', () => {
  it(`${20 * SCALE} scenarios: parallel syncs, clock skews, kills, flaky iCloud → identical`, async () => {
    let actions = 0;
    for (let s = 1; s <= 20 * SCALE; s++) {
      const r = rng(310_000 + s);
      const time = new TestTime();
      const icloud = new FakeCloud(time);
      const devices = await Promise.all(
        [0, 1, 2, 3, 4].map((i) =>
          SimDevice.create(
            `d${s}-${i}`,
            icloud,
            time,
            r.pick([0, 0, -3_600_000, 86_400_000, -86_400_000 * 30]),
          ),
        ),
      );
      for (let k = 0; k < 60; k++) {
        // Several devices act at the same instant.
        await Promise.all(
          devices
            .filter(() => r.bool(0.4))
            .map(async (d) => {
              const rs = d.repos.recipes();
              const x = rs.length ? r.pick(rs) : null;
              const p = r.int(0, 5);
              actions++;
              if (p === 0 || !x)
                return d.repos.createRecipe({ ...emptyRecipe(2), title: r.word(6).trim() || 'r' });
              if (p === 1) return d.repos.updateRecipe(x.id, { servings: r.int(1, 12) });
              if (p === 2) return d.repos.deleteRecipe(x.id);
              if (p === 3) return d.repos.toggleFavorite(x.id);
              if (p === 4) return d.repos.logCooked(x.id, '2026-10-01');
              const l = await d.repos.ensureActiveList('Courses');
              return d.repos.addItemText(l.id, `2 ${r.word(4)}y`);
            }),
        );
        time.advance(r.int(1, 3000));
        // Syncs started together, on several devices.
        if (r.bool(0.3))
          await Promise.all(devices.filter(() => r.bool(0.5)).map((d) => d.cloud.sync()));
        if (r.bool(0.05)) icloud.available = !icloud.available;
        if (r.bool(0.03)) {
          const d = r.pick(devices);
          d.kill();
          await d.boot();
        }
      }
      icloud.available = true;
      await syncAll(...devices);
      await syncAll(...devices);
      const ref = await live(devices[0]!.store);
      for (const d of devices.slice(1))
        expect(await live(d.store), `seed ${s} ${d.name}`).toEqual(ref);
      const st = devices[0]!.store;
      for (const f of st.all('favorite'))
        expect(st.get('recipe', f.data.recipeId), `seed ${s}`).not.toBeNull();
      for (const d of devices) d.kill();
    }
    console.info(`QA-COUNT client.sync.5devices.actions ${actions}`);
  }, 1_200_000);

  it('"delete all my data" on one device empties every device', async () => {
    const time = new TestTime();
    const icloud = new FakeCloud(time);
    const a = await SimDevice.create('a', icloud, time);
    const b = await SimDevice.create('b', icloud, time);
    for (let i = 0; i < 100; i++) {
      const rec = await a.repos.createRecipe({ ...emptyRecipe(), title: `R${i}` });
      await a.repos.toggleFavorite(rec.id);
    }
    await syncAll(a, b);
    expect(b.repos.recipes()).toHaveLength(100);
    time.advance();
    await a.store.removeAll(['settings']);
    await syncAll(a, b);
    expect(b.repos.recipes()).toHaveLength(0);
    expect(b.store.all('favorite')).toHaveLength(0);
  });
});

describe('huge content', () => {
  it(`${60 * SCALE} maximal recipes, a year of planning, the year's shopping list`, async () => {
    const store = await LocalStore.open(betterSqliteDriver());
    const repos = new Repos(store);
    const r = rng(320_000);
    const ids: string[] = [];
    let t = performance.now();
    for (let i = 0; i < 60 * SCALE; i++) {
      const rec = await repos.createRecipe({
        ...emptyRecipe(4),
        title: `${'Très long titre '.repeat(12)}${i}`.slice(0, 200),
        description: 'd'.repeat(2000),
        notes: 'n'.repeat(5000),
        ingredients: Array.from({ length: 200 }, (_, k) => ({
          id: uuidv7(),
          group: k % 20 === 0 ? `Groupe ${k}` : null,
          name: `${r.pick(['farine', 'lait', 'sucre', 'beurre', 'œufs'])} ${k}`,
          quantity: r.int(1, 1000),
          quantityMax: null,
          unit: r.pick(['g', 'ml', null]),
          note: null,
        })),
        steps: Array.from({ length: 100 }, () => ({
          id: uuidv7(),
          group: null,
          text: 's'.repeat(3000),
          timerSeconds: 600,
          timerLabel: null,
        })),
      });
      ids.push(rec.id);
    }
    const write = performance.now() - t;
    t = performance.now();
    for (let d = 0; d < 365; d++)
      for (const slot of ['breakfast', 'lunch', 'dinner'] as const)
        await repos.planMeal({ date: addDays('2026-01-01', d), slot, recipeId: r.pick(ids) });
    const planning = performance.now() - t;
    t = performance.now();
    const list = await repos.createList('Année');
    const res = await repos.addPlanToList(list.id, '2026-01-01', '2026-12-31');
    const shopping = performance.now() - t;
    expect(res.added).toBeGreaterThan(100);
    // One line per ingredient and kind of unit, never two.
    const keys = repos.items(list.id).map((i) => mergeKey(i.data.name, i.data.unit));
    expect(new Set(keys).size).toBe(keys.length);
    t = performance.now();
    for (let w = 0; w < 52; w++)
      repos.weekSummary(addDays('2026-01-05', w * 7), addDays('2026-01-11', w * 7));
    const summaries = performance.now() - t;
    console.info(
      `huge: write ${Math.round(write)} ms | 1095 meals ${Math.round(planning)} ms | year → list ${Math.round(shopping)} ms | 52 summaries ${Math.round(summaries)} ms`,
    );
    expect(shopping).toBeLessThan(30_000);
    expect(summaries).toBeLessThan(10_000);
    console.info(`QA-COUNT client.huge.records ${store.count()}`);
  }, 900_000);

  it(`${30 * SCALE} export → import cycles never duplicate anything`, async () => {
    const src = await LocalStore.open(betterSqliteDriver());
    const repos = new Repos(src);
    for (let i = 0; i < 200; i++) await repos.createRecipe({ ...emptyRecipe(), title: `R${i}` });
    const dst = await LocalStore.open(betterSqliteDriver());
    let json = JSON.stringify(await exportData(src));
    for (let c = 0; c < 30 * SCALE; c++) {
      await importData(dst, json);
      json = JSON.stringify(await exportData(dst));
    }
    expect(dst.count()).toBe(src.count());
    expect(await live(dst)).toEqual(await live(src));
    console.info(`QA-COUNT client.backup.cycles ${30 * SCALE}`);
  }, 600_000);
});
