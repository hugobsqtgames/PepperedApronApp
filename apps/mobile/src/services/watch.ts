import { Platform } from 'react-native';
import type { Repos } from '@pepperedapron/client';
import { timerState, type KitchenTimer } from '@pepperedapron/core';
import { sendToWatch } from '../../modules/ios-integration';
import i18n from '../i18n';

/**
 * What the Apple Watch app shows (targets/watch): the active shopping list (items not checked
 * yet) and the running kitchen timers. Sent over WatchConnectivity, phone to watch only; an item
 * checked on the watch comes back through the same queue as the widget's ticks.
 */
export function publishWatch(repos: Repos, timers: KitchenTimer[] = []) {
  if (Platform.OS !== 'ios') return;
  try {
    const list = repos.activeList();
    const items = list ? repos.items(list.id).filter((i) => !i.data.checked) : [];
    const now = Date.now();
    sendToWatch({
      listName: list?.data.name ?? '',
      items: items.slice(0, 80).map((i) => ({ id: i.id, name: i.data.name })),
      timers: timers
        .filter((t) => timerState(t, now) === 'running' && t.endsAt)
        .map((t) => ({
          id: t.id,
          label: t.label,
          end: t.endsAt! / 1000,
          start: t.endsAt! / 1000 - t.durationSeconds,
        })),
      labels: {
        shopping: i18n.t('widgets.shopping'),
        empty: i18n.t('widgets.nothing'),
        timers: i18n.t('delight.cook.timers'),
        noTimer: i18n.t('widgets.noTimer'),
      },
      sentAt: now / 1000,
    });
  } catch {
    // The watch is optional.
  }
}
