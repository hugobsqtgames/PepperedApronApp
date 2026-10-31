import { Directory, File, Paths } from 'expo-file-system';
import { exportData, restoreData, type LocalStore } from '@pepperedapron/client';

/**
 * A copy of all the data once a week, kept on the iPhone (also in the iPhone's iCloud backup),
 * in addition to the iCloud sync: if the sync goes wrong or a recipe is deleted by mistake, a
 * backup brings it back in one tap. The last 5 are kept; each can also be saved to Files.
 */
const KEEP = 5;
const WEEK_MS = 7 * 24 * 3600_000;
const META_LAST = 'auto_backup_last';
const META_OFF = 'auto_backup_off';

const dir = () => new Directory(Paths.document, 'backups');

export interface Backup {
  uri: string;
  name: string;
  /** ISO day of the backup. */
  date: string;
  size: number;
}

export function listBackups(): Backup[] {
  try {
    const d = dir();
    if (!d.exists) return [];
    return d
      .list()
      .filter(
        (f): f is File =>
          f instanceof File && /^pepperedapron-\d{4}-\d{2}-\d{2}\.json$/.test(f.name),
      )
      .map((f) => ({ uri: f.uri, name: f.name, date: f.name.slice(14, 24), size: f.size ?? 0 }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

export async function backupNow(store: LocalStore): Promise<Backup> {
  const d = dir();
  if (!d.exists) d.create({ intermediates: true });
  const day = new Date().toISOString().slice(0, 10);
  const f = new File(d, `pepperedapron-${day}.json`);
  f.write(JSON.stringify(await exportData(store)));
  await store.setMeta(META_LAST, String(Date.now()));
  for (const old of listBackups().slice(KEEP)) {
    try {
      new File(old.uri).delete();
    } catch {
      // Not critical.
    }
  }
  return { uri: f.uri, name: f.name, date: day, size: f.size ?? 0 };
}

export async function autoBackupEnabled(store: LocalStore): Promise<boolean> {
  return (await store.meta(META_OFF)) !== '1';
}
export async function setAutoBackup(store: LocalStore, on: boolean) {
  await store.setMeta(META_OFF, on ? '0' : '1');
}

/** At launch: a backup when the last one is a week old (and there is something to save). */
export async function maybeAutoBackup(store: LocalStore, hasData: boolean) {
  try {
    if (!hasData || !(await autoBackupEnabled(store))) return;
    const last = Number((await store.meta(META_LAST)) ?? 0);
    if (Date.now() - last < WEEK_MS) return;
    await backupNow(store);
  } catch {
    // A backup that fails is tried again at the next launch.
  }
}

/** Brings back what the backup holds and is missing now; returns how many items came back. */
export async function restoreBackup(store: LocalStore, b: Backup): Promise<number> {
  return restoreData(store, await new File(b.uri).text());
}

export function deleteBackup(b: Backup) {
  new File(b.uri).delete();
}
