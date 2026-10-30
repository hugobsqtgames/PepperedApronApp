/**
 * Integration: every screen of the app rendered with a real local database (SQLite in memory,
 * the App Store demo library), then "monkey" tested: random buttons pressed (seeded). A screen
 * must render, and no button may throw. Native-only pieces (navigation, files) are stubbed.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ReactElement } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

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
    router: mockNav,
    useRouter: () => mockNav,
    useLocalSearchParams: () => mockParams.current,
    useGlobalSearchParams: () => mockParams.current,
    useNavigation: () => ({
      addListener: () => () => {},
      setOptions: () => {},
      dispatch: () => {},
    }),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
    Stack: Object.assign(Pass, { Screen: () => null }),
    Link: Pass,
    Redirect: () => null,
  };
});
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
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
import { setLanguage } from '../src/i18n';
import { rng } from '../../../packages/core/src/fuzz/rng';
import { ActionSheetIOS, Alert, Share } from 'react-native';

// Action sheets and confirmation alerts: a random option is chosen, so menus are exercised too.
jest
  .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
  .mockImplementation((opts, cb) => cb(Math.floor(mockChoice.next() * opts.options.length)));
jest.spyOn(Share, 'share').mockResolvedValue({ action: 'dismissedAction' });
jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
  const b = buttons?.[Math.floor(mockChoice.next() * (buttons?.length ?? 0))];
  b?.onPress?.();
});
import { LocalStore, Repos, importData } from '@pepperedapron/client';
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
  ['whats new', () => require('../src/app/(app)/whats-new'), () => ({})],
  ['qr link', () => require('../src/app/(app)/r/[data]'), () => ({ data: 'not-a-recipe' })],
  ['profile', () => require('../src/app/(app)/profile/index'), () => ({})],
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

afterAll(async () => {
  console.info(`monkey: ${totalPresses} taps on ${SCREENS.length} screens`);
  // Kitchen timers started by the random taps keep ticking (as in the app): stop them.
  const { timers } =
    jest.requireActual<typeof import('../src/services/timers')>('../src/services/timers');
  for (const t of timers.list()) await timers.stop(t.id);
  await new Promise((r) => setTimeout(r, 1200));
});
