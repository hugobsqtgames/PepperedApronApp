import * as Notifications from 'expo-notifications';
import {
  addDays,
  emptyMainSlots,
  startOfWeek,
  toIsoDate,
  type NotificationCategory,
} from '@pepperedapron/core';
import type { Repos } from '@pepperedapron/client';
import i18n from '../i18n';
import { runtime } from './runtime';

Notifications.setNotificationHandler({
  handleNotification: async (n) => ({
    // Timers must be visible even in the foreground; reminders are silent in-app.
    shouldShowBanner: n.request.content.data?.kind === 'timer',
    shouldShowList: true,
    shouldPlaySound: n.request.content.data?.kind === 'timer',
    shouldSetBadge: false,
  }),
});

export async function notificationsAllowed(): Promise<boolean> {
  const s = await Notifications.getPermissionsAsync();
  return s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** Only called when the user does something that needs a notification (timer, reminder toggle). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (await notificationsAllowed()) return true;
  const r = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return r.granted;
}

function pref(repos: Repos, c: NotificationCategory) {
  return repos.settings().notifications[c];
}

export async function scheduleTimerNotification(
  id: string,
  label: string,
  endsAt: number,
): Promise<string | null> {
  const repos = runtime.session?.repos;
  if (repos && !pref(repos, 'timers')) return null;
  if (!(await notificationsAllowed())) return null;
  return Notifications.scheduleNotificationAsync({
    identifier: `timer-${id}`,
    content: {
      title: i18n.t('notifications.timerDone', { label }),
      body: i18n.t('notifications.timerDoneBody'),
      sound: 'default',
      data: { kind: 'timer', timerId: id },
      interruptionLevel: 'timeSensitive',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(endsAt),
    },
  });
}

export async function cancelNotification(id: string | null) {
  if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
}

async function cancelKind(kind: string) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => n.content.data?.kind === kind)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/**
 * Meal reminders for the next 7 days (max one per day, at the chosen time, only when a dinner is
 * planned) and a single Sunday nudge when next week is almost empty. Rescheduled after changes.
 */
export async function rescheduleReminders(repos: Repos, now = new Date()) {
  if (!(await notificationsAllowed())) return;
  await cancelKind('meal');
  await cancelKind('nudge');
  const s = repos.settings();
  const [hh, mm] = s.dinnerReminderTime.split(':').map(Number);
  if (s.notifications.mealReminder) {
    const today = toIsoDate(now);
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      const entry =
        repos.entries(date, date).find((e) => e.data.slot === 'dinner') ??
        repos.entries(date, date).find((e) => e.data.slot === 'lunch');
      if (!entry) continue;
      const title = entry.data.recipeId
        ? repos.recipe(entry.data.recipeId)?.data.title
        : entry.data.customTitle;
      if (!title) continue;
      const at = new Date(`${date}T00:00:00`);
      at.setHours(hh ?? 17, mm ?? 30, 0, 0);
      if (at <= now) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `meal-${date}`,
        content: {
          title: i18n.t('notifications.tonight', { title }),
          body: i18n.t('notifications.tonightBody'),
          data: {
            kind: 'meal',
            url: entry.data.recipeId ? `/recipe/${entry.data.recipeId}` : '/planning',
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: at,
        },
      });
    }
  }
  if (s.notifications.planningNudge) {
    const nextWeek = addDays(startOfWeek(toIsoDate(now)), 7);
    const entries = repos
      .entries(nextWeek, addDays(nextWeek, 6))
      .map((e) => ({ id: e.id, date: e.data.date, slot: e.data.slot, position: e.data.position }));
    if (emptyMainSlots(entries, nextWeek) >= 12) {
      const sunday = new Date(`${addDays(nextWeek, -1)}T18:00:00`);
      if (sunday > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: `nudge-${nextWeek}`,
          content: {
            title: i18n.t('notifications.planningNudge'),
            body: i18n.t('notifications.planningNudgeBody'),
            data: { kind: 'nudge', url: '/planning' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: sunday,
          },
        });
      }
    }
  }
}

/**
 * Use-by reminders: one notification per day, at 6 pm the day before, listing what expires the
 * next day (cupboard, fridge, freezer). Rescheduled when the pantry changes.
 */
export async function rescheduleExpiry(repos: Repos, now = new Date()) {
  if (!(await notificationsAllowed())) return;
  await cancelKind('expiry');
  if (!repos.settings().notifications.expiry) return;
  const byDay = new Map<string, string[]>();
  for (const p of repos.pantryItems()) {
    const d = p.data.expiresOn;
    if (d) byDay.set(d, [...(byDay.get(d) ?? []), p.data.name]);
  }
  for (const [day, names] of [...byDay].sort().slice(0, 30)) {
    const at = new Date(`${addDays(day, -1)}T18:00:00`);
    if (at <= now) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `expiry-${day}`,
      content: {
        title: i18n.t('notifications.expiry', {
          count: names.length,
          names: names.slice(0, 4).join(', '),
        }),
        body: i18n.t('notifications.expiryBody'),
        data: { kind: 'expiry', url: '/' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  }
}

/** "Your shopping list is ready" — next morning, at most once a day. */
export async function scheduleShoppingReady(repos: Repos, count: number, now = new Date()) {
  if (!pref(repos, 'shoppingReady') || !(await notificationsAllowed()) || count === 0) return;
  const at = new Date(now);
  at.setDate(at.getDate() + 1);
  at.setHours(9, 0, 0, 0);
  await Notifications.scheduleNotificationAsync({
    identifier: `shopping-${toIsoDate(at)}`,
    content: {
      title: i18n.t('notifications.shoppingReady'),
      body: i18n.t('notifications.shoppingReadyBody', { count }),
      data: { kind: 'shopping', url: '/shopping' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
    },
  });
}
