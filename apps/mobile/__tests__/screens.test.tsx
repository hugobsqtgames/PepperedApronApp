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
