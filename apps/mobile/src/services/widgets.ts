import { Platform } from 'react-native';
import {
  addDays,
  computeTotalMinutes,
  formatMinutes,
  nextMeal,
  toIsoDate,
  type Locale,
} from '@pepperedapron/core';
import { recipePhotoUri } from '../lib/media';
import type { Repos } from '@pepperedapron/client';
import i18n from '../i18n';
import { ENV } from './env';

/**
 * Publishes a small JSON snapshot to the App Group so the WidgetKit extension (targets/widgets)
 * can render "Ce soir", "Prochain repas", "Liste de courses" and "Recette au hasard" offline.
 */
export async function publishWidgetData(repos: Repos, now = new Date()) {
  if (Platform.OS !== 'ios') return;
  try {
    const { ExtensionStorage } = await import('@bacons/apple-targets');
    const storage = new ExtensionStorage(ENV.appGroup);
    const today = toIsoDate(now);
    const entries = repos.entries(today, addDays(today, 7));
    const title = (e: (typeof entries)[number]) =>
      (e.data.recipeId ? repos.recipe(e.data.recipeId)?.data.title : e.data.customTitle) ?? '';
    const tonight = entries.find((e) => e.data.date === today && e.data.slot === 'dinner');
    const next = nextMeal(
      entries.map((e) => ({
        ...e,
        date: e.data.date,
        slot: e.data.slot,
        position: e.data.position,
      })),
      now,
    );
    const list = repos.activeList();
    const items = list ? repos.items(list.id).filter((i) => !i.data.checked) : [];
    const random = repos.randomRecipe();
    storage.set('labels', {
      tonight: i18n.t('widgets.tonight'),
      nextMeal: i18n.t('widgets.nextMeal'),
      shopping: i18n.t('widgets.shopping'),
      random: i18n.t('widgets.random'),
      nothing: i18n.t('widgets.nothing'),
    });
    const tonightRecipe = tonight?.data.recipeId ? repos.recipe(tonight.data.recipeId) : null;
    const minutes = tonightRecipe ? computeTotalMinutes(tonightRecipe.data) : null;
    const photo = await tonightPhoto(tonightRecipe ? recipePhotoUri(tonightRecipe) : null);
    storage.set(
      'tonight',
      tonight
        ? {
            photo: photo ?? '',
            minutes: minutes ? formatMinutes(minutes, i18n.language as Locale) : '',
            title: title(tonight),
            url: tonight.data.recipeId
              ? `pepperedapron://recipe/${tonight.data.recipeId}`
              : 'pepperedapron://planning',
          }
        : { title: '', url: 'pepperedapron://planning' },
    );
    storage.set(
      'nextMeal',
      next
        ? { title: title(next as never), slot: i18n.t(`slots.${next.slot}`), date: next.date }
        : { title: '', slot: '', date: '' },
    );
    storage.set('shopping', {
      name: list?.data.name ?? '',
      remaining: items.length,
      items: items
        .slice(0, 6)
        .map((i) => i.data.name)
        .join('\n'),
    });
    // Interactive widget: each item can be checked off from the widget.
    storage.set(
      'shoppingItems',
      items.slice(0, 6).map((i) => ({ id: i.id, name: i.data.name })),
    );
    // Siri answers (targets/intents), in the app's language.
    storage.set('intentLabels', {
      tonight: i18n.t('siri.tonight', { title: '%@' }),
      nothingTonight: i18n.t('siri.nothingTonight'),
      added: i18n.t('siri.added', { item: '%@' }),
      addFailed: i18n.t('siri.addFailed'),
      random: i18n.t('siri.random', { title: '%@' }),
      noRecipe: i18n.t('siri.noRecipe'),
    });
    storage.set(
      'random',
      random
        ? { title: random.data.title, url: `pepperedapron://recipe/${random.id}` }
        : { title: '', url: 'pepperedapron://' },
    );
    ExtensionStorage.reloadWidget();
  } catch {
    // Widgets are optional; never break the app for them.
  }
}

/**
 * What was done outside the app while it was closed: items checked off in the shopping widget,
 * items added with Siri ("Add milk to my groceries"). Queued in the App Group by the extensions,
 * applied here when the app opens or comes back, then cleared.
 */
export async function applyExtensionRequests(repos: Repos) {
  if (Platform.OS !== 'ios') return;
  try {
    const { ExtensionStorage } = await import('@bacons/apple-targets');
    const storage = new ExtensionStorage(ENV.appGroup);
    const read = (key: string): string[] => {
      try {
        const v = JSON.parse(storage.get(key) ?? '[]') as unknown;
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
      } catch {
        return [];
      }
    };
    const checks = read('pendingChecks');
    const adds = read('pendingAdds');
    if (!checks.length && !adds.length) return;
    storage.set('pendingChecks', '[]');
    storage.set('pendingAdds', '[]');
    for (const id of checks) {
      const item = repos.items(repos.activeList()?.id ?? '').find((i) => i.id === id);
      if (item && !item.data.checked) await repos.toggleItem(id);
    }
    if (adds.length) {
      const list = await repos.ensureActiveList(i18n.t('shopping.defaultName'));
      for (const text of adds) await repos.addItemText(list.id, text);
    }
    await publishWidgetData(repos);
  } catch {
    // Optional: the requests stay queued until the next try.
  }
}

/**
 * The next kitchen timer for the timer widget (a ring that empties, on the home and lock
 * screens): its name, its start and its end. Null clears it.
 */
export async function publishTimerWidget(
  t: { label: string; endsAt: number | null; durationSeconds: number } | null,
) {
  if (Platform.OS !== 'ios') return;
  try {
    const { ExtensionStorage } = await import('@bacons/apple-targets');
    const storage = new ExtensionStorage(ENV.appGroup);
    storage.set(
      'timer',
      t?.endsAt
        ? {
            label: t.label,
            end: t.endsAt / 1000,
            start: t.endsAt / 1000 - t.durationSeconds,
          }
        : { label: '', end: 0, start: 0 },
    );
    storage.set('timerLabels', {
      title: i18n.t('delight.cook.timers'),
      none: i18n.t('widgets.noTimer'),
    });
    ExtensionStorage.reloadWidget('PATimer');
  } catch {
    // Optional.
  }
}

/**
 * Tonight's dish photo for the widget: a small copy in the App Group container (widgets cannot
 * read the app's files). Returns the file name, or null.
 */
async function tonightPhoto(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  try {
    const { Paths, File } = await import('expo-file-system');
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const shared = Paths.appleSharedContainers[ENV.appGroup];
    if (!shared) return null;
    const img = await ImageManipulator.manipulate(uri).resize({ width: 360 }).renderAsync();
    const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });
    const dest = new File(shared, 'widget-tonight.jpg');
    if (dest.exists) dest.delete();
    new File(saved.uri).copy(dest);
    return 'widget-tonight.jpg';
  } catch {
    return null;
  }
}
