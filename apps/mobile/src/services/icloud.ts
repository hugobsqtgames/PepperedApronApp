import { Directory, File, Paths } from 'expo-file-system';
import { CloudStorage, CloudStorageScope } from 'react-native-cloud-storage';
import type { CloudDrive, CloudEntry, PhotoFiles } from '@pepperedapron/client';

/**
 * The app's private iCloud container ("app data" scope: invisible in the Files app, removed
 * when the user deletes the app's iCloud data in Settings). Only the user's own devices see it.
 */
const scope = CloudStorageScope.AppData;
const abs = (path: string) => `/${path}`;
const parent = (path: string) => path.slice(0, path.lastIndexOf('/'));

async function ensureDir(path: string) {
  const dir = parent(path);
  if (dir && !(await CloudStorage.exists(abs(dir), scope)))
    await CloudStorage.mkdir(abs(dir), scope);
}

/** Files evicted from the device are downloaded on demand; the caller retries on its next run. */
async function requestDownload(path: string) {
  try {
    await CloudStorage.triggerSync(abs(path), scope);
  } catch {
    // Not in iCloud yet.
  }
}

export const iCloudDrive: CloudDrive = {
  isAvailable: () => CloudStorage.isCloudAvailable(),
  async list(dir) {
    if (!(await CloudStorage.exists(abs(dir), scope))) return [];
    const names = (await CloudStorage.readdir(abs(dir), scope)).filter((n) => !n.startsWith('.'));
    return Promise.all(
      names.map(async (name): Promise<CloudEntry> => {
        try {
          const st = await CloudStorage.stat(abs(`${dir}/${name}`), scope);
          return { name, modifiedAt: Math.round(st.mtimeMs) };
        } catch {
          return { name, modifiedAt: null };
        }
      }),
    );
  },
  async readText(path) {
    try {
      return await CloudStorage.readFile(abs(path), { scope });
    } catch (e) {
      await requestDownload(path);
      throw e;
    }
  },
  async writeText(path, text) {
    await ensureDir(path);
    await CloudStorage.writeFile(abs(path), text, { scope });
  },
  async upload(path, localUri) {
    await ensureDir(path);
    await CloudStorage.uploadFile(abs(path), localUri, { mimeType: 'image/jpeg' }, scope);
  },
  async download(path, localUri) {
    try {
      await CloudStorage.downloadFile(abs(path), localUri, scope);
    } catch (e) {
      await requestDownload(path);
      throw e;
    }
  },
  remove: (path) => CloudStorage.unlink(abs(path), scope),
};

export const photosDir = () => new Directory(Paths.document, 'photos');

/** Recipe photos live in the app's Documents/photos folder (also covered by device backups). */
export const localPhotos: PhotoFiles = {
  async list() {
    const dir = photosDir();
    if (!dir.exists) return [];
    return dir
      .list()
      .filter((f): f is File => f instanceof File)
      .map((f) => ({ name: f.name, modifiedAt: f.info().modificationTime ?? null }));
  },
  uriOf: (key) => {
    const dir = photosDir();
    if (!dir.exists) dir.create({ intermediates: true });
    return new File(dir, key).uri;
  },
  async remove(key) {
    const f = new File(photosDir(), key);
    if (f.exists) f.delete();
  },
};
