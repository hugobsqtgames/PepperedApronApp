import { Platform } from 'react-native';
import { addDays, nextMeal, toIsoDate } from '@pepperedapron/core';
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
    storage.set(
      'tonight',
      tonight
        ? {
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
