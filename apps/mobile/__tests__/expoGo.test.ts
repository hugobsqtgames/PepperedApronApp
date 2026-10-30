/*
 * Expo Go has none of the app's own native code (iCloud storage, widgets, share extension...).
 * The real react-native-cloud-storage is used here without its native module, exactly as in
 * Expo Go: the app must still open its local database and work, with sync simply off.
 */
jest.mock('../src/services/sqlite', () => ({
  openSqliteDriver: async () => {
    const { betterSqliteDriver } = jest.requireActual<
      typeof import('../../../packages/client/test/betterSqliteDriver')
    >('../../../packages/client/test/betterSqliteDriver');
    return Object.assign(betterSqliteDriver(), { name: 'test', close: async () => undefined });
  },
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///doc' },
  Directory: class {
    exists = true;
    create() {}
    list() {
      return [];
    }
  },
  File: class {
    exists = false;
  },
}));

import { runtime } from '../src/services/runtime';
import { iCloudDrive } from '../src/services/icloud';

afterAll(() => jest.clearAllTimers());

describe('Expo Go (no native module of our own)', () => {
  it('the app starts on its local data; iCloud is reported unavailable', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await runtime.boot();
    expect(runtime.status).toBe('ready');
    // The local database reads and writes.
    const { store } = runtime.session!;
    await store.setMeta('expo_go_check', '1');
    expect(await store.meta('expo_go_check')).toBe('1');
    await expect(iCloudDrive.isAvailable()).resolves.toBe(false);
    await jest.advanceTimersByTimeAsync(5000);
    warn.mockRestore();
  });
});
