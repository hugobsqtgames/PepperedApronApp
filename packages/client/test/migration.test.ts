/**
 * Data written by an older version (backup file, another device's sync file not updated yet)
 * must keep loading: fields added later are filled with their defaults, nothing is dropped.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_ID } from '@pepperedapron/core';
import { importData, LocalStore, parseSyncRecord, Repos } from '../src';
import { casesRun, rng } from '../../core/src/fuzz/rng';
import { betterSqliteDriver } from './betterSqliteDriver';

/** Fields added after the first version, per entity (each has a default in the schema). */
const ADDED: Record<string, string[]> = {
  recipe: ['rating', 'personalNote', 'review'],
  mealPlanEntry: ['leftover'],
  shoppingItem: ['price'],
  settings: ['firstName', 'cookTextScale', 'cookReadAloud'],
  cookLog: ['photoKey'],
  pantryItem: ['place', 'expiresOn'],
};

const demo = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../docs/store/demo-backup.json'), 'utf8'),
) as { format: string; records: { entity: string; data: Record<string, unknown> }[] };

describe('older data formats', () => {
  it('300 random older versions of the demo library load with every record', () => {
    for (let s = 1; s <= 300; s++) {
      const r = rng(95_000 + s);
      for (const rec of demo.records) {
        const old = { ...rec, data: { ...rec.data } };
        for (const k of ADDED[rec.entity] ?? []) if (r.bool()) delete old.data[k];
        const parsed = parseSyncRecord(old);
        expect(parsed, `seed ${s}: ${rec.entity}`).not.toBeNull();
        for (const k of ADDED[rec.entity] ?? [])
          expect(parsed!.data, `seed ${s}`).toHaveProperty(k);
      }
    }
  });

  it('settings saved before the expiry reminders existed keep every reminder on', async () => {
    const store = await LocalStore.open(betterSqliteDriver());
    const {
      notifications,
      cookReadAloud: _a,
      cookTextScale: _b,
      firstName: _c,
      ...rest
    } = DEFAULT_SETTINGS;
    const { expiry: _d, ...oldNotifications } = notifications;
    const imported = await importData(
      store,
      JSON.stringify({
        format: demo.format,
        records: [
          {
            entity: 'settings',
            id: SETTINGS_ID,
            hlc: '001793358312350-00000-01a18c7c-337b-746f-91ad-7999934e5ca6',
            deleted: false,
            data: { ...rest, notifications: oldNotifications },
          },
        ],
      }),
    );
    expect(imported).toBe(1);
    const s = new Repos(store).settings();
    expect(s.notifications.expiry).toBe(true);
    expect(s.cookReadAloud).toBe(false);
    expect(s.cookTextScale).toBe(1);
  });

  it('a database reopened after an app update keeps everything (schema migration)', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pa-mig-')), 'db.sqlite');
    let driver = betterSqliteDriver(file);
    let store = await LocalStore.open(driver);
    await importData(store, JSON.stringify(demo));
    const before = (await store.snapshot()).length;
    driver.close();
    driver = betterSqliteDriver(file);
    store = await LocalStore.open(driver);
    expect((await store.snapshot()).length).toBe(before);
    expect(new Repos(store).recipes().length).toBeGreaterThan(10);
    driver.close();
  });
});

afterAll(() => console.info(`QA-COUNT client.fuzz.migration.cases ${casesRun()}`));
