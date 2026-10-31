import * as Notifications from 'expo-notifications';
import { clockOf } from '@pepperedapron/core';
import i18n from '../i18n';
import { ensureNotificationPermission } from './notifications';

/**
 * "Ready at 8 pm": a reminder at the moment to start cooking. One per recipe (or per meal of
 * several recipes); asked by the user, so it does not depend on the reminder settings.
 */
export interface StartReminder {
  key: string;
  title: string;
  start: Date;
  ready: Date;
}

const id = (key: string) => `start-${key}`;

export async function scheduleStart(p: {
  key: string;
  title: string;
  start: Date;
  ready: Date;
  url: string;
}): Promise<'scheduled' | 'now' | 'denied'> {
  await cancelStart(p.key);
  // Less than a minute to go: it is time now, no reminder.
  if (p.start.getTime() - Date.now() < 60_000) return 'now';
  if (!(await ensureNotificationPermission())) return 'denied';
  await Notifications.scheduleNotificationAsync({
    identifier: id(p.key),
    content: {
      title: i18n.t('readyAt.notifTitle', { title: p.title }),
      body: i18n.t('readyAt.notifBody', { time: clockOf(p.ready) }),
      sound: 'default',
      interruptionLevel: 'timeSensitive',
      data: {
        kind: 'start',
        key: p.key,
        url: p.url,
        title: p.title,
        start: p.start.toISOString(),
        ready: p.ready.toISOString(),
      },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.start },
  });
  return 'scheduled';
}

export async function cancelStart(key: string) {
  await Notifications.cancelScheduledNotificationAsync(id(key)).catch(() => undefined);
}

/** The start reminder waiting for `key`, if any. */
export async function pendingStart(key: string): Promise<StartReminder | null> {
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  const n = all.find((x) => x.identifier === id(key));
  const d = n?.content.data as { title?: string; start?: string; ready?: string } | undefined;
  if (!d?.start || !d.ready) return null;
  const start = new Date(d.start);
  if (start.getTime() < Date.now()) return null;
  return { key, title: d.title ?? '', start, ready: new Date(d.ready) };
}
