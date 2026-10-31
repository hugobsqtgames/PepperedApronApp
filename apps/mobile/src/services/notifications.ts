import * as Notifications from 'expo-notifications';
import {
  addDays,
  currentSeason,
  emptyMainSlots,
  fromIsoDate,
  recipeSeasons,
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

/** "Turn the chicken over": a reminder during a timer, at `at` (ms). */
export async function scheduleTimerReminder(
  timerId: string,
  n: number,
  label: string,
  kind: 'flip' | 'stir' | 'baste',
  at: number,
): Promise<string | null> {
  const repos = runtime.session?.repos;
  if (repos && !pref(repos, 'timers')) return null;
  if (!(await notificationsAllowed()) || at <= Date.now()) return null;
  return Notifications.scheduleNotificationAsync({
    identifier: `timer-${timerId}-r${n}`,
    content: {
      title: i18n.t(`timerReminders.${kind}`, { label }),
      body: i18n.t('timerReminders.body'),
      sound: 'default',
      data: { kind: 'timer', timerId },
      interruptionLevel: 'timeSensitive',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
  });
}

/** The reminders of a timer (paused, stopped, changed). */
export async function cancelTimerReminders(timerId: string) {
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(
    all
      .filter((n) => n.identifier.startsWith(`timer-${timerId}-r`))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
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
      // The chosen day before the week starts (Sunday by default), at the chosen time.
      let day = addDays(nextWeek, -1);
      for (let k = 1; k <= 7; k++) {
        const d = addDays(nextWeek, -k);
        if (fromIsoDate(d).getDay() === s.planningNudgeDay) {
          day = d;
          break;
        }
      }
      const at = new Date(`${day}T${s.planningNudgeTime}:00`);
      if (at > now) {
        const list = weekIdeas(repos, nextWeek, now);
        await Notifications.scheduleNotificationAsync({
          identifier: `nudge-${nextWeek}`,
          content: {
            title: i18n.t('notifications.planningNudge'),
            body: list.length
              ? i18n.t('notifications.planningNudgeIdeas', { list: list.join(', ') })
              : i18n.t('notifications.planningNudgeBody'),
            data: { kind: 'nudge', url: '/planning' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: at,
          },
        });
      }
    }
  }
}

/**
 * Three ideas for the week in the reminder: dishes of the season and favourites, the ones not
 * cooked for the longest first, varying from one week to the next.
 */
function weekIdeas(repos: Repos, weekStart: string, now: Date): string[] {
  const season = currentSeason(now);
  const favs = new Set(repos.favoriteRecipes().map((r) => r.id));
  const lastCooked = new Map<string, string>();
  for (const l of repos.allCookLogs())
    if ((lastCooked.get(l.data.recipeId) ?? '') < l.data.date)
      lastCooked.set(l.data.recipeId, l.data.date);
  const pool = repos
    .library()
    .filter((r) => favs.has(r.id) || recipeSeasons(r.data).includes(season))
    .sort((a, b) => (lastCooked.get(a.id) ?? '').localeCompare(lastCooked.get(b.id) ?? ''))
    .slice(0, 9);
  if (!pool.length) return [];
  const shift = Number(weekStart.replace(/-/g, '')) % pool.length;
  return [...pool.slice(shift), ...pool.slice(0, shift)].slice(0, 3).map((r) => r.data.title);
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
