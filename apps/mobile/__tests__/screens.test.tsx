/**
 * Integration: every screen of the app rendered with a real local database (SQLite in memory,
 * the App Store demo library), then "monkey" tested: random buttons pressed (seeded). A screen
 * must render, and no button may throw. Native-only pieces (navigation, files) are stubbed.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';

const mockParams: { current: Record<string, string> } = { current: {} };
const mockNav = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  dismissTo: jest.fn(),
  setParams: jest.fn(),
  canGoBack: () => true,
};
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Pass = ({ children }: { children?: unknown }) => (children ?? null) as never;
  return {
    // Read when used: the mock is built before mockNav is defined (imports come first).
    get router() {
      return mockNav;
    },
    useRouter: () => mockNav,
    useLocalSearchParams: () => mockParams.current,
    useGlobalSearchParams: () => mockParams.current,
    useNavigation: () => ({
      addListener: () => () => {},
      setOptions: () => {},
      dispatch: () => {},
    }),
    usePreventRemove: () => () => {},
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
    Stack: Object.assign(Pass, { Screen: () => null }),
    Link: Object.assign((p: { children?: unknown }) => Pass(p), {
      AppleZoom: Pass,
      AppleZoomTarget: Pass,
    }),
    Redirect: () => null,
  };
});
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
// The barcode camera: permission given, no barcode seen (the journeys call the lookup directly).
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, async () => ({})],
}));
jest.mock('expo-media-library/legacy', () => ({
  requestPermissionsAsync: async () => ({ granted: false }),
  getAssetsAsync: async () => ({ assets: [] }),
  getAssetInfoAsync: async () => ({}),
  MediaType: { photo: 'photo' },
  SortBy: { creationTime: 'creationTime' },
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { __esModule: true, default: View };
});
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: async () => ({ granted: false }),
  requestMediaLibraryPermissionsAsync: async () => ({ granted: false }),
  launchCameraAsync: async () => ({ canceled: true, assets: null }),
  launchImageLibraryAsync: async () => ({ canceled: true, assets: null }),
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: async () => ({ canceled: true, assets: null }),
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ granted: false, ios: { status: 0 } }),
  requestPermissionsAsync: async () => ({ granted: false, ios: { status: 0 } }),
  getAllScheduledNotificationsAsync: async () => [],
  scheduleNotificationAsync: async () => 'id',
  cancelScheduledNotificationAsync: async () => {},
  setNotificationHandler: () => {},
  useLastNotificationResponse: () => null,
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
/** Which option the user picks in action sheets and alerts (set from the seed). */
const mockChoice = { next: () => 0 };

// The real store, in memory, behind the app's runtime.
const mockRuntime: Record<string, unknown> = {
  status: 'ready',
  session: null,
  cloudEnabled: false,
  subscribe: () => () => {},
  onRemoteChange: () => () => {},
  scheduleSync: () => {},
  syncNow: async () => {},
  setCloudEnabled: async () => {},
};
jest.mock('../src/services/runtime', () => ({ runtime: mockRuntime }));

import { ActionSheetProvider, PromptProvider, ToastProvider } from '../src/ui';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import i18n, { setLanguage } from '../src/i18n';
import { rng } from '../../../packages/core/src/fuzz/rng';
import { ActionSheetIOS, Alert, Share } from 'react-native';

// Action sheets and confirmation alerts: a random option is chosen, so menus are exercised too.
jest
  .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
  .mockImplementation((opts, cb) => cb(Math.floor(mockChoice.next() * opts.options.length)));
jest
  .spyOn(Share, 'share')
  .mockResolvedValue({ action: 'dismissedAction', activityType: undefined });
jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
  const b = buttons?.[Math.floor(mockChoice.next() * (buttons?.length ?? 0))];
  b?.onPress?.();
});
import { emptyRecipe, LocalStore, Repos, importData } from '@pepperedapron/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const { betterSqliteDriver } = jest.requireActual<
  typeof import('../../../packages/client/test/betterSqliteDriver')
>('../../../packages/client/test/betterSqliteDriver');

let repos: Repos;
const ids: Record<string, string> = {};

beforeEach(async () => {
  const store = await LocalStore.open(betterSqliteDriver());
  await importData(
    store,
    fs.readFileSync(path.resolve(__dirname, '../../../docs/store/demo-backup.json'), 'utf8'),
  );
  repos = new Repos(store);
  mockRuntime.session = {
    store,
    repos,
    cloud: {
      snapshot: { status: 'idle', lastSyncAt: null, error: null },
      subscribe: () => () => {},
      sync: async () => {},
    },
    driver: { name: 'test', close: async () => {} },
  };
  const r = repos.recipes()[0]!;
  const r2 = repos.recipes()[1]!;
  ids.recipe = r.id;
  ids.recipe2 = r2.id;
  ids.collection = repos.collections()[0]!.id;
  ids.list = repos.lists()[0]!.id;
  ids.item = repos.items(ids.list)[0]!.id;
  await repos.addPantryText('500 g de riz');
  // A cooking history (journal, badges, year in review, cuisine map, leftovers), one photo.
  const year = new Date().getFullYear();
  const all = repos.recipes();
  for (let i = 0; i < 14; i++) {
    const log = await repos.logCooked(
      all[i % all.length]!.id,
      `${year}-${String((i % 10) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
    );
    if (i === 0) await repos.setCookPhoto(log.id, 'demo-photo.jpg');
  }
  if (r.data.steps[0]) await repos.setStepNote(r.id, r.data.steps[0].id, 'Baisser à 170 °C');
  const sc = await repos.saveSmartCollection(null, {
    name: 'Rapide',
    emoji: null,
    rules: {
      diet: null,
      maxMinutes: 30,
      categories: [],
      season: null,
      minRating: null,
      notCookedDays: null,
    },
  });
  ids.smart = sc.id;
  await setLanguage('fr');
});

const wrap = (ui: ReactElement) => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 47, left: 0, right: 0, bottom: 34 },
    }}
  >
    <ThemeProvider preference="light">
      <ToastProvider>
        <ActionSheetProvider>
          <PromptProvider>{ui}</PromptProvider>
        </ActionSheetProvider>
      </ToastProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

/* eslint-disable @typescript-eslint/no-require-imports */
const SCREENS: [string, () => { default: () => ReactElement }, () => Record<string, string>][] = [
  ['home', () => require('../src/app/(app)/(tabs)/index'), () => ({})],
  ['search', () => require('../src/app/(app)/(tabs)/search'), () => ({})],
  ['favorites', () => require('../src/app/(app)/(tabs)/favorites'), () => ({})],
  ['all recipes', () => require('../src/app/(app)/recipes'), () => ({})],
  ['planning', () => require('../src/app/(app)/(tabs)/planning'), () => ({})],
  ['shopping', () => require('../src/app/(app)/(tabs)/shopping'), () => ({})],
  ['add', () => require('../src/app/(app)/add'), () => ({})],
  ['calendar', () => require('../src/app/(app)/calendar'), () => ({})],
  ['recipe', () => require('../src/app/(app)/recipe/[id]/index'), () => ({ id: ids.recipe! })],
  ['recipe (missing)', () => require('../src/app/(app)/recipe/[id]/index'), () => ({ id: 'nope' })],
  [
    'cook',
    () => require('../src/app/(app)/recipe/[id]/cook'),
    () => ({ id: ids.recipe!, servings: '6' }),
  ],
  [
    'recipe collections',
    () => require('../src/app/(app)/recipe/[id]/collections'),
    () => ({ id: ids.recipe! }),
  ],
  ['editor (new)', () => require('../src/app/(app)/recipe/edit'), () => ({})],
  ['editor (existing)', () => require('../src/app/(app)/recipe/edit'), () => ({ id: ids.recipe! })],
  [
    'merge',
    () => require('../src/app/(app)/recipe/merge'),
    () => ({ keep: ids.recipe!, drop: ids.recipe2! }),
  ],
  [
    'collection',
    () => require('../src/app/(app)/collection/[id]'),
    () => ({ id: ids.collection! }),
  ],
  [
    'smart collection',
    () => require('../src/app/(app)/collection/[id]'),
    () => ({ id: ids.smart!, smart: '1' }),
  ],
  ['smart rules', () => require('../src/app/(app)/collection/smart'), () => ({ id: ids.smart! })],
  ['pantry', () => require('../src/app/(app)/pantry'), () => ({})],
  ['pantry receipt', () => require('../src/app/(app)/pantry-scan'), () => ({ mode: 'receipt' })],
  ['pantry barcode', () => require('../src/app/(app)/pantry-scan'), () => ({ mode: 'barcode' })],
  [
    'batch cooking',
    () => require('../src/app/(app)/cook-plan'),
    () => ({ ids: `${ids.recipe},${ids.recipe2}`, mode: 'asap' }),
  ],
  [
    'meal plan',
    () => require('../src/app/(app)/cook-plan'),
    () => ({ ids: `${ids.recipe},${ids.recipe2}`, mode: 'together' }),
  ],
  [
    'cook (two recipes)',
    () => require('../src/app/(app)/recipe/[id]/cook'),
    () => ({ id: ids.recipe!, with: ids.recipe2! }),
  ],
  [
    'search (fridge)',
    () => require('../src/app/(app)/(tabs)/search'),
    () => ({ mode: 'fridge', pantry: '1' }),
  ],
  [
    'plan pick',
    () => require('../src/app/(app)/plan/pick'),
    () => ({ date: '2026-11-02', slot: 'dinner' }),
  ],
  ['templates', () => require('../src/app/(app)/plan/templates'), () => ({})],
  ['shopping lists', () => require('../src/app/(app)/shopping/lists'), () => ({})],
  ['aisles', () => require('../src/app/(app)/shopping/aisles'), () => ({})],
  [
    'shopping item',
    () => require('../src/app/(app)/shopping/item/[id]'),
    () => ({ id: ids.item! }),
  ],
  ['converter', () => require('../src/app/(app)/tools/converter'), () => ({})],
  ['import link', () => require('../src/app/(app)/import/link'), () => ({})],
  ['import text', () => require('../src/app/(app)/import/text'), () => ({})],
  ['import queue', () => require('../src/app/(app)/import/queue'), () => ({})],
  ['import review', () => require('../src/app/(app)/import/review'), () => ({ id: ids.recipe! })],
  [
    'import review (missing)',
    () => require('../src/app/(app)/import/review'),
    () => ({ id: 'nope' }),
  ],
  ['tutorial', () => require('../src/app/(app)/tutorial'), () => ({})],
  ['whats new', () => require('../src/app/(app)/whats-new'), () => ({})],
  ['qr link', () => require('../src/app/(app)/r/[data]'), () => ({ data: 'not-a-recipe' })],
  ['profile', () => require('../src/app/(app)/profile/index'), () => ({})],
  ['journal', () => require('../src/app/(app)/profile/journal'), () => ({})],
  ['badges', () => require('../src/app/(app)/profile/badges'), () => ({})],
  ['cuisine map', () => require('../src/app/(app)/profile/map'), () => ({})],
  ['year review', () => require('../src/app/(app)/profile/review'), () => ({})],
  ['appearance', () => require('../src/app/(app)/profile/appearance'), () => ({})],
  ['data', () => require('../src/app/(app)/profile/data'), () => ({})],
  ['help', () => require('../src/app/(app)/profile/help'), () => ({})],
  ['language', () => require('../src/app/(app)/profile/language'), () => ({})],
  ['my recipes', () => require('../src/app/(app)/profile/my-recipes'), () => ({})],
  ['notifications', () => require('../src/app/(app)/profile/notifications'), () => ({})],
  ['privacy', () => require('../src/app/(app)/profile/privacy'), () => ({})],
];
/* eslint-enable @typescript-eslint/no-require-imports */

const PRESSES = Number(process.env.MONKEY_PRESSES ?? 25);
let totalPresses = 0;

describe.each(SCREENS)('%s', (name, load, params) => {
  it('renders with real data', async () => {
    mockParams.current = params();
    const Screen = load().default;
    await render(wrap(<Screen />));
    expect(screen.toJSON()).not.toBeNull();
  });

  it(`survives ${PRESSES} random taps`, async () => {
    mockParams.current = params();
    const Screen = load().default;
    await render(wrap(<Screen />));
    const r = rng(name.length * 7919 + 1);
    mockChoice.next = r.next;
    let pressed = 0;
    for (let k = 0; k < PRESSES; k++) {
      const buttons = screen.queryAllByRole('button');
      if (!buttons.length) break;
      const b = r.pick(buttons);
      // Destructive confirmations go through Alert (stubbed): pressing is what matters here.
      await act(async () => {
        fireEvent.press(b);
      });
      pressed++;
      totalPresses++;
    }
    expect(pressed).toBeGreaterThanOrEqual(0);
  });
});

/* eslint-disable @typescript-eslint/no-require-imports */
const screenOf = (p: string) => (require(p) as { default: () => ReactElement }).default;
/* eslint-enable @typescript-eslint/no-require-imports */
const tap = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};
const settle = () => act(async () => new Promise((r) => setTimeout(r, 30)));

describe('journeys: what the user does is really saved', () => {
  it('regression: the first dish finished in cook mode shows confetti in cook mode', async () => {
    for (const l of repos.allCookLogs()) await repos.removeCookLog(l.id);
    // The confetti animation runs to its end at once in tests: keep it on screen to see it.
    const { Animated } = jest.requireActual<typeof import('react-native')>('react-native');
    const timing = jest
      .spyOn(Animated, 'timing')
      .mockReturnValue({ start: () => undefined, stop: () => undefined, reset: () => undefined });
    const r = repos.recipes().find((x) => x.data.steps.length === 2)!;
    mockParams.current = { id: r.id };
    const Cook = screenOf('../src/app/(app)/recipe/[id]/cook');
    await render(wrap(<Cook />));
    await tap(screen.getByTestId('cook-next'));
    await tap(screen.getByTestId('cook-finish'));
    await settle();
    expect(screen.getByText(i18n.t('delight.celebrate.first'))).toBeTruthy();
    expect(screen.getByTestId('confetti')).toBeTruthy();
    timing.mockRestore();
  });

  it('the week as a table of dish photos; a dish is dragged to another day', async () => {
    const Planning = screenOf('../src/app/(app)/(tabs)/planning');
    const today = new Date().toISOString().slice(0, 10);
    await repos.planMeal({ date: today, slot: 'dinner', recipeId: ids.recipe! });
    await render(wrap(<Planning />));
    await tap(screen.getByTestId('plan-view-table'));
    expect(screen.getAllByTestId('table-meal').length).toBeGreaterThan(0);
    expect(screen.getByText(i18n.t('delight.plan.dragHint'))).toBeTruthy();
    const { dayAt } = jest.requireActual<typeof import('../src/features/planning/WeekTable')>(
      '../src/features/planning/WeekTable',
    );
    const rows = [
      { date: '2026-11-02', top: 100, bottom: 240 },
      { date: '2026-11-03', top: 252, bottom: 390 },
    ];
    expect([dayAt(120, rows), dayAt(300, rows), dayAt(245, rows), dayAt(900, rows)]).toEqual([
      '2026-11-02',
      '2026-11-03',
      null,
      null,
    ]);
  });

  it('the note on a step shows on the recipe page and in cook mode', async () => {
    mockParams.current = { id: ids.recipe! };
    const Recipe = screenOf('../src/app/(app)/recipe/[id]/index');
    await render(wrap(<Recipe />));
    expect(screen.getByTestId('step-note-0')).toBeTruthy();
    expect(screen.getAllByText('Baisser à 170 °C').length).toBeGreaterThan(0);
    await cleanup();
    const Cook = screenOf('../src/app/(app)/recipe/[id]/cook');
    await render(wrap(<Cook />));
    expect(screen.getAllByText('Baisser à 170 °C').length).toBeGreaterThan(0);
  });

  it('the cuisine of a recipe can be chosen; drink and side ideas are shown', async () => {
    mockParams.current = { id: ids.recipe! };
    mockChoice.next = () => 0.5;
    const Recipe = screenOf('../src/app/(app)/recipe/[id]/index');
    await render(wrap(<Recipe />));
    expect(screen.getByText(i18n.t('delight.pairing.title'))).toBeTruthy();
    expect(screen.getByText(i18n.t('delight.pairing.soft'))).toBeTruthy();
    await tap(screen.getByTestId('recipe-cuisine'));
    await settle();
    expect(repos.recipe(ids.recipe!)!.data.cuisine).not.toBeNull();
  });

  it('cook mode does not show a finished timer of another recipe (TestFlight feedback)', async () => {
    const { timers } =
      jest.requireActual<typeof import('../src/services/timers')>('../src/services/timers');
    // Timers still running from earlier tests are shown on purpose: start from none.
    for (const t of timers.list()) await timers.stop(t.id);
    await timers.start({ label: 'Udon', seconds: 1, recipeId: ids.recipe2!, stepIndex: 1 });
    await new Promise((r) => setTimeout(r, 1300));
    mockParams.current = { id: ids.recipe! };
    const Cook = screenOf('../src/app/(app)/recipe/[id]/cook');
    await render(wrap(<Cook />));
    expect(screen.queryAllByTestId('timer-ring')).toHaveLength(0);
    // Its own timers are shown, and the toolbar's new-timer button is there.
    await timers.start({ label: 'Poisson', seconds: 600, recipeId: ids.recipe!, stepIndex: 0 });
    await settle();
    expect(screen.getAllByTestId('timer-ring')).toHaveLength(1);
    expect(screen.getByTestId('cook-new-timer')).toBeTruthy();
    for (const t of timers.list()) await timers.stop(t.id);
  });

  it('the pantry is one tap away, from home and from the groceries (TestFlight feedback)', async () => {
    mockNav.push.mockClear();
    const Home = screenOf('../src/app/(app)/(tabs)/index');
    await render(wrap(<Home />));
    await tap(screen.getByTestId('open-pantry'));
    expect(mockNav.push).toHaveBeenCalledWith('/pantry');
    await cleanup();
    mockNav.push.mockClear();
    const Shopping = screenOf('../src/app/(app)/(tabs)/shopping');
    await render(wrap(<Shopping />));
    await tap(screen.getByTestId('shopping-pantry'));
    expect(mockNav.push).toHaveBeenCalledWith('/pantry');
  });

  it('planning: the title stays on one line, its tools are icons (feedback: "Plannin|g")', async () => {
    const Planning = screenOf('../src/app/(app)/(tabs)/planning');
    await render(wrap(<Planning />));
    const title = screen.getByTestId('planning-title');
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.adjustsFontSizeToFit).toBe(true);
    // Templates and calendar no longer take the title's room with their text.
    expect(screen.queryByText(i18n.t('planning.templates'))).toBeNull();
    expect(screen.getByLabelText(i18n.t('planning.templates'))).toBeTruthy();
    expect(screen.getByLabelText(i18n.t('planning.calendar'))).toBeTruthy();
  });

  it('batch cooking for next week, from this week (feedback)', async () => {
    const { addDays, startOfWeek, toIsoDate } =
      jest.requireActual<typeof import('@pepperedapron/core')>('@pepperedapron/core');
    const next = addDays(startOfWeek(toIsoDate(new Date())), 7);
    const withSteps = repos
      .recipes()
      .filter((r) => r.data.steps.length)
      .slice(0, 2);
    expect(withSteps).toHaveLength(2);
    const planned = [];
    for (const [i, r] of withSteps.entries())
      planned.push(
        await repos.planMeal({ date: addDays(next, i), slot: 'dinner', recipeId: r.id }),
      );
    mockNav.push.mockClear();
    const Planning = screenOf('../src/app/(app)/(tabs)/planning');
    await render(wrap(<Planning />));
    await tap(screen.getByTestId('plan-batch-next'));
    const url = String(mockNav.push.mock.calls.at(-1)?.[0]);
    expect(url).toContain('/cook-plan?ids=');
    for (const r of withSteps) expect(url).toContain(r.id);
    await cleanup();
    for (const e of planned) await repos.removeMeal(e.id);
  });

  it('groceries: every ticked item is put away in one tap (feedback: only some went in)', async () => {
    const list = await repos.ensureActiveList(i18n.t('shopping.defaultName'));
    for (const it of repos.items(list.id)) await repos.removeItem(it.id);
    for (const line of ['200 g de beurre', '500 g de riz', '1 verre d’eau'])
      await repos.addItemText(list.id, line);
    for (const it of repos.items(list.id)) await repos.toggleItem(it.id);
    const before = repos.pantryItems().length;
    const Shopping = screenOf('../src/app/(app)/(tabs)/shopping');
    await render(wrap(<Shopping />));
    await tap(screen.getByTestId('shopping-store-checked'));
    await settle();
    expect(repos.items(list.id)).toHaveLength(0);
    const names = repos.pantryItems().map((p) => p.data.name);
    expect(names).toEqual(expect.arrayContaining(['beurre', 'riz']));
    expect(names.some((n) => /eau/.test(n))).toBe(false);
    expect(repos.pantryItems().length).toBeGreaterThanOrEqual(before + 1);
  });

  it('a waiting import says what it waits for (TestFlight feedback)', async () => {
    const { importQueue } = jest.requireActual<typeof import('../src/services/importQueue')>(
      '../src/services/importQueue',
    );
    const q = importQueue as unknown as {
      state: Record<string, unknown>;
      loaded: boolean;
      start: () => Promise<void>;
      emit: () => void;
    };
    const job = (id: string, status: string, title: string | null) => ({
      id,
      source: { kind: 'link', url: `https://www.tiktok.com/@a/video/${id}` },
      batch: false,
      collection: null,
      force: false,
      status,
      stage: null,
      attempts: 0,
      recipeId: null,
      title,
      notice: null,
      error: null,
      addedAt: Date.now(),
    });
    const start = q.start;
    q.start = async () => undefined;
    q.loaded = true;
    try {
      q.state = {
        jobs: [job('1', 'running', 'Pâtes au pesto'), job('2', 'pending', null)],
        pausedUntil: 0,
        pauseReason: null,
      };
      q.emit();
      mockParams.current = { ids: '2' };
      const Queue = screenOf('../src/app/(app)/import/queue');
      await render(wrap(<Queue />));
      expect(
        screen.getByText(i18n.t('import.waitingFor', { what: 'Pâtes au pesto' })),
      ).toBeTruthy();
      await cleanup();
      q.state = {
        jobs: [job('2', 'pending', null)],
        pausedUntil: Date.now() + 15_000,
        pauseReason: 'offline',
      };
      q.emit();
      await render(wrap(<Queue />));
      expect(screen.getByText(i18n.t('import.waitingNetwork'))).toBeTruthy();
      expect(screen.getByTestId('import-retry-now')).toBeTruthy();
    } finally {
      q.start = start;
      q.state = { jobs: [], pausedUntil: 0, pauseReason: null };
      q.emit();
    }
  });

  it('the + sheet closes before opening a screen, never replaced by it (TestFlight: app frozen)', async () => {
    const Add = screenOf('../src/app/(app)/add');
    for (const [id, path] of [
      ['add-instagram', '/import/instagram'],
      ['add-link', '/import/link'],
      ['add-text', '/import/text'],
      ['add-photo', '/import/photo'],
      ['add-dictate', '/import/dictate'],
      ['add-blank', '/recipe/edit'],
    ] as const) {
      mockNav.back.mockClear();
      mockNav.push.mockClear();
      mockNav.replace.mockClear();
      await render(wrap(<Add />));
      await tap(screen.getByTestId(id));
      expect(mockNav.back).toHaveBeenCalledTimes(1);
      expect(mockNav.push).not.toHaveBeenCalled();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 600));
      });
      expect(mockNav.push).toHaveBeenCalledWith(path);
      expect(mockNav.replace).not.toHaveBeenCalled();
      await cleanup();
    }
  });

  it('an import finished while its screen is open opens the recipe (TestFlight feedback)', async () => {
    // The queue updates a job in place (the same object goes pending → running → done): the
    // screen must notice, not stay on "Waiting…" with the recipe saved.
    const { importQueue } = jest.requireActual<typeof import('../src/services/importQueue')>(
      '../src/services/importQueue',
    );
    const q = importQueue as unknown as {
      state: { jobs: Record<string, unknown>[]; pausedUntil: number; pauseReason: null };
      loaded: boolean;
      start: () => Promise<void>;
      emit: () => void;
    };
    const job: Record<string, unknown> = {
      id: 'live',
      source: { kind: 'link', url: 'https://www.tiktok.com/@a/video/42' },
      batch: false,
      collection: null,
      force: false,
      status: 'pending',
      stage: null,
      attempts: 0,
      recipeId: null,
      title: null,
      notice: null,
      error: null,
      addedAt: Date.now(),
    };
    const start = q.start;
    q.start = async () => undefined;
    q.loaded = true;
    mockNav.replace.mockClear();
    try {
      q.state = { jobs: [job], pausedUntil: 0, pauseReason: null };
      q.emit();
      mockParams.current = { ids: 'live' };
      const Queue = screenOf('../src/app/(app)/import/queue');
      await render(wrap(<Queue />));
      await act(async () => {
        Object.assign(job, { status: 'running', stage: 'fetching' });
        q.emit();
      });
      expect(mockNav.replace).not.toHaveBeenCalled();
      await act(async () => {
        Object.assign(job, { status: 'done', stage: null, recipeId: 'r-42', title: 'Pâtes' });
        q.emit();
      });
      expect(mockNav.replace).toHaveBeenCalledWith('/import/review?id=r-42');
      expect(screen.queryByText(i18n.t('import.waiting'))).toBeNull();
      expect(screen.getByText(i18n.t('import.savedTitle'))).toBeTruthy();
      await tap(screen.getByText(i18n.t('import.openSaved')));
      expect(mockNav.replace).toHaveBeenCalledWith('/recipe/r-42');
    } finally {
      q.start = start;
      q.state = { jobs: [], pausedUntil: 0, pauseReason: null };
      q.emit();
      mockParams.current = {};
    }
  });

  it('wine, beer or cider are suggested only once turned on (age rating)', async () => {
    const { pairingsFor } =
      jest.requireActual<typeof import('@pepperedapron/core')>('@pepperedapron/core');
    // A savoury dish that has an alcoholic pairing.
    const withDrink = repos
      .recipes()
      .find((r) => pairingsFor({ ...r.data, cuisine: r.data.cuisine }).drink !== null)!;
    expect(withDrink).toBeTruthy();
    mockParams.current = { id: withDrink.id };
    const Recipe = screenOf('../src/app/(app)/recipe/[id]/index');
    expect(repos.settings().alcoholPairings).toBe(false);
    await render(wrap(<Recipe />));
    expect(screen.getByText(i18n.t('delight.pairing.soft'))).toBeTruthy();
    expect(screen.queryByText(i18n.t('delight.pairing.drink'))).toBeNull();
    await cleanup();
    await repos.updateSettings({ alcoholPairings: true });
    await render(wrap(<Recipe />));
    expect(screen.getByText(i18n.t('delight.pairing.drink'))).toBeTruthy();
  });

  it('home: the tonight reason never shares its row with the buttons (feedback: "Pour change|r")', async () => {
    const Home = screenOf('../src/app/(app)/(tabs)/index');
    await render(wrap(<Home />));
    const why = screen.getByTestId('tonight-why');
    // The nearest row (flexDirection: row) holding the cook button holds no reason text.
    let row = screen.getByTestId('tonight-cook').parent;
    const isRow = (n: typeof row) => {
      const st = [n?.props.style].flat(Infinity) as ({ flexDirection?: string } | undefined)[];
      return st.some((x) => x?.flexDirection === 'row');
    };
    while (row && !isRow(row)) row = row.parent;
    expect(row).toBeTruthy();
    const inRow = (n: typeof row): boolean => n === row || (n?.parent ? inRow(n.parent) : false);
    expect(inRow(why)).toBe(false);
    // Season banner: a sentence that reads right.
    expect(i18n.t('delight.season.count', { count: 1 })).toBe('Dans 1 de vos recettes');
  });

  it('home: tonight’s planned dinner is the big card', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await repos.planMeal({ date: today, slot: 'dinner', recipeId: ids.recipe2! });
    const Home = screenOf('../src/app/(app)/(tabs)/index');
    await render(wrap(<Home />));
    expect(screen.getByTestId('tonight')).toBeTruthy();
    expect(screen.getByText(i18n.t('delight.tonight.planned'))).toBeTruthy();
    expect(screen.getAllByText(repos.recipe(ids.recipe2!)!.data.title).length).toBeGreaterThan(0);
  });

  it('a new recipe typed in the editor is saved with its ingredient', async () => {
    mockParams.current = {};
    const Edit = screenOf('../src/app/(app)/recipe/edit');
    await render(wrap(<Edit />));
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('editor-title'), 'Tarte du test');
      fireEvent.changeText(
        screen.getAllByPlaceholderText(i18n.t('editor.ingredientPlaceholder'))[0]!,
        '250 g de farine',
      );
    });
    await tap(screen.getByTestId('editor-save'));
    await settle();
    const saved = repos.recipes().find((r) => r.data.title === 'Tarte du test');
    expect(saved).toBeTruthy();
    expect(saved!.data.ingredients.map((x) => [x.quantity, x.unit, x.name])).toEqual([
      [250, 'g', 'farine'],
    ]);
    expect(mockNav.replace).toHaveBeenCalledWith(`/recipe/${saved!.id}`);
  });

  it('a recipe can be put in several categories (feedback)', async () => {
    const { emptyRecipe } =
      jest.requireActual<typeof import('@pepperedapron/client')>('@pepperedapron/client');
    const r = await repos.createRecipe({
      ...emptyRecipe(4),
      title: 'Gratin de pâtes',
      tags: ['famille'],
    });
    mockParams.current = { id: r.id };
    const Edit = screenOf('../src/app/(app)/recipe/edit');
    await render(wrap(<Edit />));
    await tap(screen.getByText(i18n.t('categories.pasta')));
    await tap(screen.getByText(i18n.t('categories.main')));
    await tap(screen.getByTestId('editor-save'));
    await settle();
    const saved = repos.recipe(r.id)!;
    expect(saved.data.category).toBe('pasta');
    // The other category is kept with the tags; the user's own tag is still there.
    expect(saved.data.tags).toEqual(['famille', 'main']);
    await cleanup();
    // The recipe page shows both categories, and only the user's tag as a tag.
    mockParams.current = { id: r.id };
    const Recipe = screenOf('../src/app/(app)/recipe/[id]/index');
    await render(wrap(<Recipe />));
    expect(screen.getAllByText(i18n.t('categories.main')).length).toBeGreaterThan(0);
    expect(screen.queryByText('#main')).toBeNull();
    expect(screen.getByText('#famille')).toBeTruthy();
    await cleanup();
    await repos.deleteRecipe(r.id);
  });

  it('the recipe page estimates calories per serving (feedback)', async () => {
    const { emptyRecipe } =
      jest.requireActual<typeof import('@pepperedapron/client')>('@pepperedapron/client');
    const { uuidv7 } =
      jest.requireActual<typeof import('@pepperedapron/core')>('@pepperedapron/core');
    const ing = (name: string, quantity: number | null, unit: string | null = null) => ({
      id: uuidv7(),
      group: null,
      name,
      quantity,
      quantityMax: null,
      unit,
      note: null,
    });
    const r = await repos.createRecipe({
      ...emptyRecipe(4),
      title: 'Crêpes du dimanche',
      ingredients: [
        ing('farine', 250, 'g'),
        ing('œufs', 4),
        ing('lait', 500, 'ml'),
        ing('beurre fondu', 50, 'g'),
        ing('sel', 1, 'pinch'),
      ],
    });
    mockParams.current = { id: r.id };
    const Recipe = screenOf('../src/app/(app)/recipe/[id]/index');
    await render(wrap(<Recipe />));
    expect(screen.getByText(i18n.t('recipe.kcal', { count: 440 }))).toBeTruthy();
    (Alert.alert as jest.Mock).mockClear();
    await tap(screen.getByTestId('recipe-kcal'));
    expect((Alert.alert as jest.Mock).mock.calls[0]![0]).toBe(i18n.t('recipe.kcalTitle'));
    await cleanup();
    // Not enough known ingredients: no number rather than a wrong one.
    await repos.updateRecipe(r.id, {
      ingredients: [ing('ingrédient mystère', 1), ing('autre chose', 2)],
    });
    await render(wrap(<Recipe />));
    expect(screen.queryByTestId('recipe-kcal')).toBeNull();
    await cleanup();
    await repos.deleteRecipe(r.id);
  });

  it('all your recipes: one page with every recipe, sorted and filtered (feedback)', async () => {
    // From home: the big tile and "See all" next to the recent recipes.
    mockNav.push.mockClear();
    const Home = screenOf('../src/app/(app)/(tabs)/index');
    await render(wrap(<Home />));
    await tap(screen.getByTestId('all-recipes-tile'));
    expect(mockNav.push).toHaveBeenCalledWith('/recipes');
    await cleanup();
    const Page = screenOf('../src/app/(app)/recipes');
    await render(wrap(<Page />));
    const total = repos.recipes().length;
    expect(screen.getByText(i18n.t('common.recipes', { count: total }))).toBeTruthy();
    const titles = () =>
      repos
        .recipes()
        .map((r) => r.data.title)
        .filter((title) => screen.queryAllByText(title).length > 0);
    // A to Z.
    await tap(screen.getByTestId('all-recipes-sort-az'));
    const shown = titles();
    expect(shown.length).toBeGreaterThan(0);
    // Filter.
    const one = repos.recipes()[0]!.data.title;
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('all-recipes-filter'), one);
    });
    expect(screen.getAllByText(one).length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('all-recipes-filter'), 'zzzz introuvable');
    });
    expect(screen.getByText(i18n.t('allRecipes.noMatch'))).toBeTruthy();
  });

  it('an empty title is refused and nothing is saved', async () => {
    mockParams.current = {};
    const before = repos.recipes().length;
    const Edit = screenOf('../src/app/(app)/recipe/edit');
    await render(wrap(<Edit />));
    await tap(screen.getByTestId('editor-save'));
    await settle();
    expect(repos.recipes().length).toBe(before);
    expect(screen.getByText(i18n.t('errors.titleRequired'))).toBeTruthy();
  });

  it('favorite and "cooked today" on the recipe page are saved', async () => {
    mockParams.current = { id: ids.recipe! };
    const wasFav = repos.isFavorite(ids.recipe!);
    const today = new Date().toISOString().slice(0, 10);
    const cooked = repos.cookLogs(ids.recipe!).length;
    const hadToday = repos.cookLogs(ids.recipe!).some((c) => c.data.date === today);
    const Recipe = screenOf('../src/app/(app)/recipe/[id]/index');
    await render(wrap(<Recipe />));
    await tap(screen.getByTestId('recipe-favorite'));
    await tap(screen.getByTestId('recipe-cooked'));
    await settle();
    expect(repos.isFavorite(ids.recipe!)).toBe(!wasFav);
    expect(repos.cookLogs(ids.recipe!).length).toBe(cooked + (hadToday ? 0 : 1));
  });

  it('cook mode: "next" moves on, "finish" on the last step logs the recipe', async () => {
    const r = repos.recipes().find((x) => x.data.steps.length === 2)!;
    mockParams.current = { id: r.id };
    const Cook = screenOf('../src/app/(app)/recipe/[id]/cook');
    await render(wrap(<Cook />));
    expect(screen.getByText(i18n.t('cook.step', { n: 1, total: 2 }))).toBeTruthy();
    await tap(screen.getByTestId('cook-next'));
    expect(screen.getByText(i18n.t('cook.step', { n: 2, total: 2 }))).toBeTruthy();
    await tap(screen.getByTestId('cook-finish'));
    await settle();
    expect(repos.cookLogs(r.id).length).toBeGreaterThan(0);
    // The dish photo is offered first ("Plus tard" goes on).
    expect(screen.getByText(i18n.t('delight.cook.resultTitle'))).toBeTruthy();
    await tap(screen.getByTestId('cook-result-later'));
    expect(screen.getByText(i18n.t('cook.doneTitle'))).toBeTruthy();
  });

  it('ticking a grocery item is saved', async () => {
    mockParams.current = {};
    const list = repos.activeList()!;
    const Shopping = screenOf('../src/app/(app)/(tabs)/shopping');
    await render(wrap(<Shopping />));
    // The first item shown (the list is virtualised: not every row is rendered).
    const shown = screen.getAllByTestId(/^item-check-/)[0]!;
    const name = String(shown.props.testID).slice('item-check-'.length);
    const item = repos.items(list.id).find((x) => x.data.name === name && !x.data.checked)!;
    await tap(shown);
    await settle();
    expect(repos.items(list.id).find((x) => x.id === item.id)!.data.checked).toBe(true);
  });

  it('something typed in the pantry is stored with its quantity', async () => {
    mockParams.current = {};
    const Pantry = screenOf('../src/app/(app)/pantry');
    await render(wrap(<Pantry />));
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('pantry-add'), '2 kg de pommes');
    });
    await act(async () => {
      fireEvent(screen.getByTestId('pantry-add'), 'submitEditing');
    });
    await settle();
    const p = repos.pantryItems().find((x) => x.data.name === 'pommes');
    expect(p?.data.quantity).toBe(2);
    expect(p?.data.unit).toBe('kg');
  });

  it('"add the week to groceries" fills the active list from the planning', async () => {
    mockParams.current = {};
    const list = repos.activeList()!;
    for (const it of repos.items(list.id)) await repos.removeItem(it.id);
    // Meals of the week shown, whatever today's date (the demo library plans another week).
    const { startOfWeek, toIsoDate, addDays } =
      jest.requireActual<typeof import('@pepperedapron/core')>('@pepperedapron/core');
    const monday = startOfWeek(toIsoDate(new Date()));
    for (const [i, r] of repos.recipes().slice(0, 3).entries())
      await repos.planMeal({ date: addDays(monday, i), slot: 'dinner', recipeId: r.id });
    const Planning = screenOf('../src/app/(app)/(tabs)/planning');
    await render(wrap(<Planning />));
    await tap(screen.getByTestId('plan-to-shopping'));
    await settle();
    expect(repos.items(list.id).length).toBeGreaterThan(5);
  });

  it('a smart collection is saved with its rules', async () => {
    mockParams.current = {};
    const Smart = screenOf('../src/app/(app)/collection/smart');
    await render(wrap(<Smart />));
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText(i18n.t('smart.namePlaceholder')), 'Végé');
    });
    // The diet row comes first (the same word is also a category).
    await tap(screen.getAllByText(i18n.t('diets.vegetarian'))[0]!);
    await tap(screen.getByText(i18n.t('common.save')));
    await settle();
    const sc = repos.smartCollections().find((x) => x.data.name === 'Végé');
    expect(sc?.data.rules.diet).toBe('vegetarian');
    expect(repos.smartCollectionRecipes(sc!.id).length).toBeGreaterThan(0);
  });
});

describe('journeys: cooking several dishes, the pantry, sharing', () => {
  it('batch cooking: every step of every recipe in one order, ticked as it goes', async () => {
    const two = repos
      .recipes()
      .filter((r) => r.data.steps.length >= 2)
      .slice(0, 2);
    mockParams.current = { ids: two.map((r) => r.id).join(','), mode: 'asap' };
    const Plan = screenOf('../src/app/(app)/cook-plan');
    await render(wrap(<Plan />));
    const steps = two.reduce((n, r) => n + r.data.steps.length, 0);
    expect(screen.getAllByTestId('plan-item')).toHaveLength(steps);
    await tap(screen.getByTestId('plan-start'));
    await tap(screen.getAllByLabelText(i18n.t('plan.markDone'))[0]!);
    expect(screen.getAllByLabelText(i18n.t('plan.undo'))).toHaveLength(1);
    // A meal: the same dishes, all ready at the time chosen.
    await tap(screen.getByText(i18n.t('plan.modeMeal')));
    expect(screen.getByText(i18n.t('readyAt.title'))).toBeTruthy();
  });

  it('cook mode: an ingredient ticked on a step stays ticked in the ingredient list', async () => {
    const r = repos.recipes().find((x) => x.data.steps.length && x.data.ingredients.length > 2)!;
    mockParams.current = { id: r.id };
    const Cook = screenOf('../src/app/(app)/recipe/[id]/cook');
    await render(wrap(<Cook />));
    const total = r.data.ingredients.length;
    const label = (n: number) =>
      `${i18n.t('cook.ingredients')}, ${i18n.t('cook.ticked', { n, total })}`;
    const boxes = screen.queryAllByRole('checkbox');
    if (boxes.length) {
      await tap(boxes[0]!);
      expect(screen.getByLabelText(label(1))).toBeTruthy();
    } else expect(screen.getByLabelText(label(0))).toBeTruthy();
  });

  it('a receipt photo becomes pantry items, checked before they are put away', async () => {
    const photos =
      jest.requireActual<typeof import('../src/services/photos')>('../src/services/photos');
    const ocr = jest.requireActual<typeof import('../src/services/ocr')>('../src/services/ocr');
    const pick = jest.spyOn(photos, 'pickImage').mockResolvedValue({ uri: 'file:///ticket.jpg' });
    const read = jest
      .spyOn(ocr, 'readTextLines')
      .mockResolvedValue(
        ['CARREFOUR', 'BEURRE DOUX 250G 2,49 €', 'LESSIVE 2L 8,99 €', 'TOTAL 11,48 €'].map(
          (text, i) => ({ text, confidence: 1, x: 0.1, y: 0.1 * i, width: 0.8, height: 0.03 }),
        ),
      );
    mockParams.current = { mode: 'receipt' };
    const Scan = screenOf('../src/app/(app)/pantry-scan');
    await render(wrap(<Scan />));
    await tap(screen.getByTestId('receipt-camera'));
    await settle();
    // The washing powder is listed, not ticked: only the butter goes to the fridge.
    expect(screen.getByText('Lessive')).toBeTruthy();
    await tap(screen.getByTestId('receipt-save'));
    await settle();
    const butter = repos.pantryItems().find((p) => p.data.name === 'Beurre doux');
    expect(butter?.data).toMatchObject({ quantity: 250, unit: 'g', place: 'fridge' });
    expect(repos.pantryItems().some((p) => p.data.name === 'Lessive')).toBe(false);
    pick.mockRestore();
    read.mockRestore();
  });

  it('a recipe imported without its steps is completed from the saved video (TestFlight)', async () => {
    const photos =
      jest.requireActual<typeof import('../src/services/photos')>('../src/services/photos');
    const auto = jest.requireActual<typeof import('../src/services/autoImport')>(
      '../src/services/autoImport',
    );
    const { emptyRecipe } =
      jest.requireActual<typeof import('@pepperedapron/client')>('@pepperedapron/client');
    const pick = jest.spyOn(photos, 'pickVideo').mockResolvedValue('file:///saved-reel.mov');
    const listen = jest.spyOn(auto, 'recipeFromVideoFile').mockResolvedValue({
      steps: [
        {
          group: null,
          text: 'Coupe 3 poivrons et enfourne-les 30 min.',
          timerSeconds: 1800,
          timerLabel: null,
        },
        {
          group: null,
          text: 'Mixe les légumes avec la crème.',
          timerSeconds: null,
          timerLabel: null,
        },
      ],
      ingredients: [
        { group: null, name: 'poivrons', quantity: 3, quantityMax: null, unit: null, note: null },
      ],
      text: 'Pour commencer tu coupes 3 poivrons…',
    });
    const r = await repos.createRecipe({ ...emptyRecipe(4), title: 'Pâtes aux poivrons' });
    mockParams.current = { id: r.id };
    const Review = screenOf('../src/app/(app)/import/review');
    await render(wrap(<Review />));
    expect(screen.getByText(i18n.t('review.fromVideoHint'))).toBeTruthy();
    await tap(screen.getByTestId('review-from-video'));
    await settle();
    expect(pick).toHaveBeenCalled();
    expect(listen).toHaveBeenCalledWith('file:///saved-reel.mov');
    const saved = repos.recipe(r.id)!;
    expect(saved.data.steps.map((x) => x.text)).toEqual([
      'Coupe 3 poivrons et enfourne-les 30 min.',
      'Mixe les légumes avec la crème.',
    ]);
    expect(saved.data.ingredients.map((x) => x.name)).toEqual(['poivrons']);
    // Steps found: the button is gone.
    expect(screen.queryByTestId('review-from-video')).toBeNull();
    pick.mockRestore();
    listen.mockRestore();
    await repos.deleteRecipe(r.id);
  });

  it('ingredients heard in the video are not added next to the written ones (TestFlight: doubles)', async () => {
    const photos =
      jest.requireActual<typeof import('../src/services/photos')>('../src/services/photos');
    const auto = jest.requireActual<typeof import('../src/services/autoImport')>(
      '../src/services/autoImport',
    );
    const { emptyRecipe } =
      jest.requireActual<typeof import('@pepperedapron/client')>('@pepperedapron/client');
    const { uuidv7 } =
      jest.requireActual<typeof import('@pepperedapron/core')>('@pepperedapron/core');
    const pick = jest.spyOn(photos, 'pickVideo').mockResolvedValue('file:///reel.mov');
    const listen = jest.spyOn(auto, 'recipeFromVideoFile').mockResolvedValue({
      steps: [
        {
          group: null,
          text: 'Fais revenir les crevettes 5 min.',
          timerSeconds: 300,
          timerLabel: null,
        },
      ],
      ingredients: [
        {
          group: null,
          name: 'crevettes',
          quantity: null,
          quantityMax: null,
          unit: null,
          note: null,
        },
        { group: null, name: 'riz', quantity: null, quantityMax: null, unit: null, note: null },
      ],
      text: 'Fais revenir les crevettes…',
    });
    const r = await repos.createRecipe({
      ...emptyRecipe(2),
      title: 'Crevettes au curry',
      ingredients: [
        {
          id: uuidv7(),
          group: null,
          name: 'Crevettes crues',
          quantity: 300,
          quantityMax: null,
          unit: 'g',
          note: null,
        },
        {
          id: uuidv7(),
          group: null,
          name: 'Riz basmati',
          quantity: 150,
          quantityMax: null,
          unit: 'g',
          note: null,
        },
      ],
    });
    mockParams.current = { id: r.id };
    const Review = screenOf('../src/app/(app)/import/review');
    await render(wrap(<Review />));
    await tap(screen.getByTestId('review-from-video'));
    await settle();
    const saved = repos.recipe(r.id)!;
    expect(saved.data.ingredients.map((x) => x.name)).toEqual(['Crevettes crues', 'Riz basmati']);
    expect(saved.data.steps).toHaveLength(1);
    pick.mockRestore();
    listen.mockRestore();
    await cleanup();
    await repos.deleteRecipe(r.id);
  });

  it('a recipe sent as a web link is read back whole, without fetching anything', async () => {
    const { webRecipeLink, linkPayload, draftFromLink } =
      jest.requireActual<typeof import('../src/lib/recipeLink')>('../src/lib/recipeLink');
    const r = repos.recipes()[0]!;
    const link = webRecipeLink(r.data, 'https://hugobsqtgames.github.io/PepperedApronApp')!;
    expect(link.url.startsWith('https://hugobsqtgames.github.io/PepperedApronApp/r/#')).toBe(true);
    const d = draftFromLink(linkPayload(link.url)!)!;
    expect(d.title).toBe(r.data.title);
    expect(d.steps.map((x) => x.text)).toEqual(r.data.steps.map((x) => x.text));
    expect(linkPayload('https://evil.example/r/#abc')).toBeNull();
  });

  it('search: "sans four" leaves out the recipes that need the oven', async () => {
    const { searchRecipes } =
      jest.requireActual<typeof import('@pepperedapron/core')>('@pepperedapron/core');
    const items = repos.searchable();
    const withOven = items.filter((x) => x.equipment?.includes('oven'));
    expect(withOven.length).toBeGreaterThan(0);
    const res = searchRecipes(items, 'sans four');
    expect(res.length).toBe(items.length - withOven.length);
  });
});

const STRESS = process.env.STRESS ? 1 : 0;
// Jest keeps every rendered tree in memory: long runs are split into parts (NAV_PART = 0, 1, …),
// each in its own process, with its own seed (tools/qa/stress.sh).
const STEPS = STRESS ? 400 : 60;
const PART = Number(process.env.NAV_PART ?? 0);

/** Random but valid params for a screen, from the data as it is now. */
function paramsNow(name: string, r: ReturnType<typeof rng>): Record<string, string> {
  const recipes = repos.recipes();
  const rec = recipes.length ? r.pick(recipes).id : 'gone';
  const cols = repos.collections();
  const smart = repos.smartCollections();
  const list = repos.activeList();
  const items = list ? repos.items(list.id) : [];
  switch (name) {
    case 'recipe':
    case 'recipe collections':
    case 'editor (existing)':
      return { id: rec };
    case 'cook':
      return { id: rec, servings: String(r.int(1, 12)) };
    case 'merge':
      return { keep: rec, drop: recipes.length > 1 ? recipes[recipes.length - 1]!.id : 'gone' };
    case 'collection':
      return { id: cols.length ? r.pick(cols).id : 'gone' };
    case 'smart collection':
      return { id: smart.length ? r.pick(smart).id : 'gone', smart: '1' };
    case 'smart rules':
      return smart.length ? { id: r.pick(smart).id } : {};
    case 'shopping item':
      return { id: items.length ? r.pick(items).id : 'gone' };
    default:
      return SCREENS.find((x) => x[0] === name)![2]();
  }
}

/** Something changing underneath the screen (another device's sync arriving). */
async function backgroundChange(r: ReturnType<typeof rng>) {
  const recipes = repos.recipes();
  const x = recipes.length ? r.pick(recipes) : null;
  await act(async () => {
    const p = r.int(0, 4);
    if (p === 0 || !x) await repos.createRecipe({ ...emptyRecipe(4), title: `Sync ${r.word(5)}` });
    else if (p === 1) await repos.deleteRecipe(x.id);
    else if (p === 2) await repos.toggleFavorite(x.id);
    else if (p === 3) await repos.updateRecipe(x.id, { title: `Renommée ${r.word(4)}` });
    else await repos.addPantryText(`${r.int(1, 9)} kg de pommes`);
  });
}

describe('journeys: first launch, as App Review sees it', () => {
  // A brand-new install: empty database, onboarding from the first slide to the app.
  const fresh = async () => {
    const store = await LocalStore.open(betterSqliteDriver());
    const empty = new Repos(store);
    (mockRuntime.session as { store: unknown; repos: unknown }).store = store;
    (mockRuntime.session as { store: unknown; repos: unknown }).repos = empty;
    return empty;
  };
  const toLastSlide = async () => {
    await act(async () => fireEvent.press(screen.getByTestId('onboarding-next')));
    await act(async () => fireEvent.press(screen.getByTestId('onboarding-skip')));
  };

  it('slides → first name → 10 welcome recipes → tutorial → the app opens', async () => {
    const r = await fresh();
    expect(r.recipes()).toHaveLength(0);
    const Onboarding = screenOf('../src/app/onboarding');
    await render(wrap(<Onboarding />));
    expect(screen.getByTestId('onboarding-next')).toBeTruthy();
    await toLastSlide();
    await act(async () => fireEvent.press(screen.getByTestId('onboarding-start')));
    await act(async () => fireEvent.changeText(screen.getByTestId('onboarding-name'), 'Camille'));
    await act(async () => fireEvent.press(screen.getByTestId('onboarding-name-submit')));
    expect(r.settings().firstName).toBe('Camille');
    await act(async () => fireEvent.press(screen.getByTestId('onboarding-starter-yes')));
    expect(r.recipes().length).toBe(10);
    for (const x of r.recipes()) {
      expect(x.data.title.length).toBeGreaterThan(2);
      expect(x.data.ingredients.length).toBeGreaterThan(1);
      expect(x.data.steps.length).toBeGreaterThan(0);
    }
    await act(async () => fireEvent.press(screen.getByTestId('tutorial-later')));
    expect(r.settings().onboardingDone).toBe(true);
  });

  it('every step can be skipped: no name, no welcome recipes', async () => {
    const r = await fresh();
    const Onboarding = screenOf('../src/app/onboarding');
    await render(wrap(<Onboarding />));
    await toLastSlide();
    await act(async () => fireEvent.press(screen.getByTestId('onboarding-start')));
    await act(async () => fireEvent.press(screen.getByTestId('onboarding-name-skip')));
    await act(async () => fireEvent.press(screen.getByTestId('onboarding-starter-no')));
    await act(async () => fireEvent.press(screen.getByTestId('tutorial-later')));
    expect(r.recipes()).toHaveLength(0);
    expect(r.settings().firstName).toBeNull();
    expect(r.settings().onboardingDone).toBe(true);
  });

  it('every screen of the app renders on an empty library (nothing planned, nothing saved)', async () => {
    await fresh();
    const rr = rng(777);
    mockChoice.next = rr.next;
    for (const [name, load, params] of SCREENS) {
      mockParams.current = params();
      const Screen = load().default;
      await render(wrap(<Screen />));
      if (!screen.toJSON()) throw new Error(`${name}: nothing rendered`);
      for (let k = 0; k < 5; k++) {
        const buttons = screen.queryAllByRole('button');
        if (!buttons.length) break;
        await act(async () => {
          fireEvent.press(rr.pick(buttons));
        });
      }
      await cleanup();
    }
  });
});

describe('journeys: a library saved by an older version of the app', () => {
  // Regression: recipes saved before "step notes" existed made cook mode fail on the phone
  // ("Cannot convert undefined value to object"). Every field that can be missing (it has a
  // default) is removed from every record, the database is reopened, then every screen is shown.
  it('every screen renders and reacts after an update', async () => {
    const { ENTITY_SCHEMAS } =
      jest.requireActual<typeof import('@pepperedapron/core')>('@pepperedapron/core');
    const driver = betterSqliteDriver();
    const first = await LocalStore.open(driver);
    await importData(
      first,
      fs.readFileSync(path.resolve(__dirname, '../../../docs/store/demo-backup.json'), 'utf8'),
    );
    const rows = await driver.all<{ entity: string; id: string; data: string }>(
      'SELECT entity, id, data FROM records WHERE deleted = 0',
    );
    let stripped = 0;
    for (const row of rows) {
      const data = JSON.parse(row.data) as Record<string, unknown>;
      const schema = ENTITY_SCHEMAS[row.entity as keyof typeof ENTITY_SCHEMAS];
      for (const k of Object.keys(data)) {
        const copy = { ...data };
        delete copy[k];
        if (schema.safeParse(copy).success) {
          delete data[k];
          stripped++;
        }
      }
      await driver.run('UPDATE records SET data = ? WHERE entity = ? AND id = ?', [
        JSON.stringify(data),
        row.entity,
        row.id,
      ]);
    }
    expect(stripped).toBeGreaterThan(50);
    const store = await LocalStore.open(driver);
    const old = new Repos(store);
    (mockRuntime.session as { store: unknown; repos: unknown }).store = store;
    (mockRuntime.session as { store: unknown; repos: unknown }).repos = old;
    const r = rng(4242);
    mockChoice.next = r.next;
    for (const [name, load, params] of SCREENS) {
      mockParams.current = params();
      const Screen = load().default;
      await render(wrap(<Screen />));
      if (!screen.toJSON()) throw new Error(`${name}: nothing rendered`);
      for (let k = 0; k < 5; k++) {
        const buttons = screen.queryAllByRole('button');
        if (!buttons.length) break;
        await act(async () => {
          fireEvent.press(r.pick(buttons));
        });
      }
      await cleanup();
    }
  });
});

describe('stress: random navigation while data changes underneath', () => {
  it(`${STEPS} screens opened, tapped and closed in a random order`, async () => {
    const r = rng(400_000 + PART * 1000 + (process.env.APP_VARIANT ?? 'development').length);
    mockChoice.next = r.next;
    let taps = 0;
    let changes = 0;
    for (let k = 0; k < STEPS; k++) {
      const [name, load] = r.pick(SCREENS);
      mockParams.current = paramsNow(name, r);
      const Screen = load().default;
      const view = await render(wrap(<Screen />));
      if (!view.toJSON()) throw new Error(`blank screen: ${name}`);
      for (let t = r.int(0, 8); t > 0; t--) {
        if (r.bool(0.15)) {
          await backgroundChange(r);
          changes++;
        }
        const buttons = screen.queryAllByRole('button');
        if (!buttons.length) break;
        await act(async () => {
          fireEvent.press(r.pick(buttons));
        });
        taps++;
      }
      await cleanup();
    }
    console.info(`QA-COUNT mobile.navigation.screens ${STEPS}`);
    console.info(`QA-COUNT mobile.navigation.taps ${taps}`);
    console.info(`QA-COUNT mobile.navigation.backgroundChanges ${changes}`);
  }, 3_600_000);
});

describe('stress: a very large library on screen', () => {
  const extra = STRESS ? 3000 : 400;
  it(`${extra} more recipes, 600 groceries, 300 pantry items: every screen renders and reacts`, async () => {
    const r = rng(410_000);
    for (let i = 0; i < extra; i++)
      await repos.createRecipe({
        ...emptyRecipe(4),
        title: `${r.pick(['Poulet', 'Tarte', 'Soupe', 'Gratin'])} ${r.word(6)} ${i}`,
        prepMinutes: r.int(5, 90),
      });
    const list = repos.activeList()!;
    for (let i = 0; i < 600; i++)
      await repos.addItemText(list.id, `${r.int(1, 9)} ${r.word(6)}z${i}`);
    for (let i = 0; i < 300; i++)
      await repos.addPantryText(`${r.int(1, 900)} g de ${r.word(5)}p${i}`);
    const slow: string[] = [];
    let taps = 0;
    for (const [name, load] of SCREENS) {
      mockParams.current = paramsNow(name, r);
      const Screen = load().default;
      const t = performance.now();
      const view = await render(wrap(<Screen />));
      if (!view.toJSON()) throw new Error(`blank screen: ${name}`);
      const ms = performance.now() - t;
      if (ms > 5000) slow.push(`${name} ${Math.round(ms)} ms`);
      for (let k = 0; k < 10; k++) {
        const buttons = screen.queryAllByRole('button');
        if (!buttons.length) break;
        await act(async () => {
          fireEvent.press(r.pick(buttons));
        });
        taps++;
      }
      await cleanup();
    }
    expect(slow).toEqual([]);
    console.info(`QA-COUNT mobile.biglibrary.screens ${SCREENS.length}`);
    console.info(`QA-COUNT mobile.biglibrary.taps ${taps}`);
  }, 3_600_000);
});

describe('stress: leaks', () => {
  const cycles = STRESS ? 500 : 200;
  it(`${cycles} screens opened and closed leave no subscription behind`, async () => {
    const { importQueue } = jest.requireActual<typeof import('../src/services/importQueue')>(
      '../src/services/importQueue',
    );
    const { timers } =
      jest.requireActual<typeof import('../src/services/timers')>('../src/services/timers');
    // What a screen could forget to release: listeners of the database, the import queue and
    // the timers (the jest heap itself keeps every rendered tree, so it says nothing here).
    const count = () => ({
      store: (repos as unknown as { store: { listeners: Set<unknown> } }).store.listeners.size,
      queue: (importQueue as unknown as { listeners: Set<unknown> }).listeners.size,
      timers: (timers as unknown as { listeners: Set<unknown> }).listeners.size,
    });
    const r = rng(430_000);
    const before = count();
    // The probe works: an open home screen does hold subscriptions.
    mockParams.current = {};
    const Home = SCREENS[0]![1]().default;
    await render(wrap(<Home />));
    expect(count().store).toBeGreaterThan(before.store);
    expect(count().queue).toBeGreaterThan(before.queue);
    await cleanup();
    for (let c = 0; c < cycles; c++) {
      const [name, load] = r.pick(SCREENS);
      mockParams.current = paramsNow(name, r);
      const Screen = load().default;
      await render(wrap(<Screen />));
      await cleanup();
    }
    expect(count()).toEqual(before);
    console.info(`QA-COUNT mobile.leaks.cycles ${cycles}`);
  }, 3_600_000);
});

describe('stress: kitchen timers', () => {
  const OPS = STRESS ? 5000 : 500;
  it(`${OPS} random timer actions keep a coherent list`, async () => {
    const { timers } =
      jest.requireActual<typeof import('../src/services/timers')>('../src/services/timers');
    const r = rng(420_000);
    for (let k = 0; k < OPS; k++) {
      const list = timers.list();
      const t = list.length ? r.pick(list) : null;
      const p = r.int(0, 5);
      if (p === 0 || !t)
        await timers.start({
          label: `T${k}`,
          seconds: r.int(1, 7200),
          recipeId: null,
          stepIndex: null,
        });
      else if (p === 1) await timers.pause(t.id);
      else if (p === 2) await timers.resume(t.id);
      else if (p === 3) await timers.extend(t.id, r.pick([60, 300, -30]));
      else await timers.stop(t.id);
      const now = timers.list();
      expect(new Set(now.map((x) => x.id)).size).toBe(now.length);
      for (const x of now) expect(timers.remaining(x)).toBeGreaterThanOrEqual(0);
    }
    for (const t of timers.list()) await timers.stop(t.id);
    expect(timers.list()).toEqual([]);
    console.info(`QA-COUNT mobile.timers.ops ${OPS}`);
  }, 3_600_000);
});

afterAll(async () => {
  console.info(`QA-COUNT mobile.monkey.taps ${totalPresses}`);
  // Kitchen timers started by the random taps keep ticking (as in the app): stop them.
  const { timers } =
    jest.requireActual<typeof import('../src/services/timers')>('../src/services/timers');
  for (const t of timers.list()) await timers.stop(t.id);
  await new Promise((r) => setTimeout(r, 1200));
});
