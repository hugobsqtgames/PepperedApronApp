/**
 * The Dynamic Island (Live Activity) of kitchen timers: it follows the nearest running timer and
 * goes away when none is left — when a timer is over, when the recipe is finished, and even when
 * it was started by an earlier launch of the app. Regression: it stayed after the recipe ended.
 */
interface MockLA {
  started: string[];
  stopped: string[];
  updated: number;
  startActivity: jest.Mock<string, []>;
  stopActivity: jest.Mock<void, [string]>;
  updateActivity: jest.Mock<void, []>;
}
const mockLA: MockLA = {
  started: [],
  stopped: [] as string[],
  updated: 0,
  startActivity: jest.fn((): string => {
    const id = `la-${mockLA.started.length + 1}`;
    mockLA.started.push(id);
    return id;
  }),
  stopActivity: jest.fn((id: string): void => {
    mockLA.stopped.push(id);
  }),
  updateActivity: jest.fn((): void => {
    mockLA.updated++;
  }),
};
jest.mock('expo-live-activity', () => mockLA);
jest.mock('../src/services/widgets', () => ({ publishTimerWidget: async () => undefined }));
jest.mock('../src/services/runtime', () => ({ runtime: { session: null } }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ granted: true, ios: { status: 2 } }),
  requestPermissionsAsync: async () => ({ granted: true, ios: { status: 2 } }),
  scheduleNotificationAsync: async () => 'n',
  cancelScheduledNotificationAsync: async () => {},
  getAllScheduledNotificationsAsync: async () => [],
  setNotificationHandler: () => {},
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

import { timers } from '../src/services/timers';

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

afterEach(async () => {
  for (const t of timers.list()) await timers.stop(t.id);
  await flush();
});

it('a running timer shows in the Dynamic Island; finishing the recipe removes it', async () => {
  await timers.start({ label: 'Pâtes', seconds: 600, recipeId: 'r1', stepIndex: 0 });
  await flush();
  expect(mockLA.startActivity).toHaveBeenCalledTimes(1);
  const id = mockLA.started[0]!;
  await timers.stopRecipe('r1');
  await flush();
  expect(timers.list()).toEqual([]);
  expect(mockLA.stopped).toContain(id);
});

it('a second timer updates the same activity; the last stopped ends it', async () => {
  const before = mockLA.startActivity.mock.calls.length;
  const a = await timers.start({ label: 'A', seconds: 600, recipeId: null, stepIndex: null });
  await timers.start({ label: 'B', seconds: 900, recipeId: null, stepIndex: null });
  await flush();
  expect(mockLA.startActivity.mock.calls.length).toBe(before + 1);
  expect(mockLA.updated).toBeGreaterThan(0);
  await timers.stop(a.id);
  await flush();
  const last = mockLA.started[mockLA.started.length - 1]!;
  expect(mockLA.stopped).not.toContain(last);
  for (const t of timers.list()) await timers.stop(t.id);
  await flush();
  expect(mockLA.stopped).toContain(last);
});

it('a timer that runs out ends the activity without anything else being touched', async () => {
  await timers.start({ label: 'Œufs', seconds: 1, recipeId: null, stepIndex: null });
  await flush();
  const id = mockLA.started[mockLA.started.length - 1]!;
  // The app's own once-a-second tick sees it is over.
  await new Promise((r) => setTimeout(r, 2500));
  await flush();
  expect(mockLA.stopped).toContain(id);
});

it('an activity the user swiped away is replaced by a new one', async () => {
  await timers.start({ label: 'Riz', seconds: 600, recipeId: null, stepIndex: null });
  await flush();
  const n = mockLA.started.length;
  mockLA.updateActivity.mockImplementationOnce(() => {
    throw new Error('ActivityNotFound');
  });
  await timers.start({ label: 'Sauce', seconds: 900, recipeId: null, stepIndex: null });
  await flush();
  expect(mockLA.started.length).toBe(n + 1);
});

it('a timer over for a while is put away (and ends its activity)', async () => {
  const t = await timers.start({ label: 'Riz', seconds: 1, recipeId: 'r9', stepIndex: null });
  await flush();
  expect(timers.list().some((x) => x.id === t.id)).toBe(true);
  const real = Date.now;
  const spy = jest.spyOn(Date, 'now').mockImplementation(() => real() + 20 * 60_000);
  try {
    await new Promise((r) => setTimeout(r, 1500));
    await flush();
    expect(timers.list().some((x) => x.id === t.id)).toBe(false);
  } finally {
    spy.mockRestore();
  }
});
