import * as Calendar from 'expo-calendar';
import { runtime } from './runtime';

/** The Reminders list chosen on this device (list ids are local to each device). */
const META_KEY = 'reminders_list_id';

export interface RemindersList {
  id: string;
  title: string;
}

/**
 * Lists of the Apple Reminders app the shopping list can be sent to. A list shared in Reminders
 * with the family shows the items on their iPhone too, without any account in PepperedApron.
 */
export async function remindersLists(): Promise<RemindersList[] | 'denied'> {
  const p = await Calendar.requestRemindersPermissions();
  if (!p.granted) return 'denied';
  const cals = await Calendar.getCalendars(Calendar.EntityTypes.REMINDER);
  return cals.filter((c) => c.allowsModifications).map((c) => ({ id: c.id, title: c.title }));
}

/** A new Reminders list, in the same account as the existing ones (iCloud when available). */
export async function createRemindersList(title: string): Promise<RemindersList> {
  const cals = await Calendar.getCalendars(Calendar.EntityTypes.REMINDER);
  const base = cals.find((c) => c.allowsModifications && c.source?.type === 'caldav') ?? cals[0];
  const cal = await Calendar.createCalendar({
    title,
    color: '#1F4D3A',
    entityType: Calendar.EntityTypes.REMINDER,
    ...(base?.source ? { sourceId: base.source.id, source: base.source } : {}),
  });
  return { id: cal.id, title: cal.title };
}

export async function lastRemindersList(): Promise<string | null> {
  return (await runtime.session?.store.meta(META_KEY)) ?? null;
}

/**
 * Add the items to a Reminders list. Items already waiting in that list (same text) are not added
 * twice, so sending the list again after adding a few things is safe. Returns how many were added.
 */
export async function sendToReminders(
  listId: string,
  items: { title: string; notes: string | null }[],
): Promise<number> {
  const cal = await Calendar.ExpoCalendar.get(listId);
  const open = await cal.listReminders(null, null, Calendar.ReminderStatus.INCOMPLETE);
  const have = new Set(open.map((r) => (r.title ?? '').trim().toLowerCase()));
  let added = 0;
  for (const item of items) {
    const key = item.title.trim().toLowerCase();
    if (!key || have.has(key)) continue;
    await cal.createReminder({ title: item.title, notes: item.notes ?? undefined });
    have.add(key);
    added++;
  }
  await runtime.session?.store.setMeta(META_KEY, listId);
  return added;
}
