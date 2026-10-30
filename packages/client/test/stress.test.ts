/**
 * Stress: a very large library (5000 recipes, 20000+ records). Time budgets are generous (CI
 * machines are slow) but catch anything quadratic; measured times are printed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, searchRecipes, uuidv7 } from '@pepperedapron/core';
import { emptyRecipe, exportData, importData, LocalStore, Repos } from '../src';
import { rng } from '../../core/src/fuzz/rng';
import { betterSqliteDriver } from './betterSqliteDriver';

const RECIPES = 5000;
const ms = (t0: number) => Math.round(performance.now() - t0);

describe('large library', () => {
  it(`${RECIPES} recipes: write, reopen, search, plan, export/import stay fast`, async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-stress-')), 'db.sqlite');
    const r = rng(99_000);
    const store = await LocalStore.open(betterSqliteDriver(file));
    const repos = new Repos(store);
    let t = performance.now();
    const ids: string[] = [];
    for (let i = 0; i < RECIPES; i++) {
      const rec = await repos.createRecipe({
        ...emptyRecipe(4),
        title: `${r.pick(['Poulet', 'Tarte', 'Soupe', 'Salade', 'Gratin'])} ${r.word(6)} ${i}`,
        prepMinutes: r.int(5, 120),
        ingredients: Array.from({ length: 8 }, () => ({
          id: uuidv7(),
          group: null,
          name: r.pick(['farine', 'poulet', 'citron', 'tomate', 'oignon', 'ail', 'crème', 'riz']),
          quantity: r.int(1, 500),
          quantityMax: null,
          unit: 'g',
          note: null,
        })),
        steps: Array.from({ length: 5 }, () => ({
          id: uuidv7(),
          group: null,
          text: 'Cuire 10 min.',
          timerSeconds: null,
          timerLabel: null,
        })),
      });
      ids.push(rec.id);
      if (i % 3 === 0) await repos.toggleFavorite(rec.id);
      if (i % 2 === 0) await repos.logCooked(rec.id, `2026-0${1 + (i % 9)}-1${i % 9}`);
    }
    const write = ms(t);

    t = performance.now();
    const reopened = await LocalStore.open(betterSqliteDriver(file));
    const open = ms(t);
    expect(reopened.count()).toBe(store.count());

    t = performance.now();
    const items = repos.searchable();
    for (const q of ['poulet rapide', 'tarte', 'citron sans ail', 'moins de 30 minutes', 'xyz'])
      searchRecipes(items, q, EMPTY_FILTERS);
    searchRecipes(items, '', { ...EMPTY_FILTERS, fridge: ['poulet', 'citron'] });
    const search = ms(t);
    // Typing: the same library objects, query after query.
    t = performance.now();
    for (const q of ['p', 'po', 'pou', 'poul', 'poule', 'poulet'])
      searchRecipes(items, q, EMPTY_FILTERS);
    const typing = ms(t);

    t = performance.now();
    for (let d = 0; d < 28; d++)
      await repos.planMeal({
        date: `2026-11-${String(d + 1).padStart(2, '0')}`,
        slot: 'dinner',
        recipeId: ids[d]!,
      });
    const list = await repos.createList('Courses');
    await repos.addPlanToList(list.id, '2026-11-01', '2026-11-28');
    repos.weekSummary('2026-11-02', '2026-11-08');
    repos.forgottenRecipes('2026-10-30');
    const plan = ms(t);

    t = performance.now();
    const json = JSON.stringify(await exportData(store));
    const dst = await LocalStore.open(betterSqliteDriver());
    await importData(dst, json);
    const backup = ms(t);
    expect(dst.count()).toBe(store.count());

    console.info(
      `stress: ${store.count()} records | write ${write} ms | reopen ${open} ms | 6 searches ${search} ms | typing 6 keys ${typing} ms | plan+list ${plan} ms | export+import ${backup} ms (${Math.round(json.length / 1024)} KB)`,
    );
    expect(open).toBeLessThan(5000);
    expect(search).toBeLessThan(5000);
    expect(plan).toBeLessThan(5000);
    expect(backup).toBeLessThan(20000);
  }, 300_000);
});
