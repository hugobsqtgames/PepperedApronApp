import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { uuidv7 } from '@pepperedapron/core';
import { photosDir, runtime } from './runtime';

export type PhotoSource = 'camera' | 'library' | 'files';
export type PickResult = { uri: string } | { denied: true } | null;

const MAX_EDGE = 1600;

/** Ask for permission only at the moment the user chooses a source. */
export async function pickImage(source: PhotoSource): Promise<PickResult> {
  if (source === 'files') {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
      copyToCacheDirectory: true,
    });
    return r.canceled || !r.assets[0] ? null : { uri: r.assets[0].uri };
  }
  if (source === 'camera') {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return { denied: true };
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
    });
    return r.canceled || !r.assets[0] ? null : { uri: r.assets[0].uri };
  }
  const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!p.granted && p.accessPrivileges !== 'limited') return { denied: true };
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
    allowsMultipleSelection: false,
  });
  return r.canceled || !r.assets[0] ? null : { uri: r.assets[0].uri };
}

/**
 * Resize (max 1600 px), re-encode as JPEG (strips EXIF/GPS) and keep a durable local copy so the
 * photo shows instantly and can be uploaded later when offline. Huge or corrupt images throw.
 */
export async function preparePhoto(
  uri: string,
): Promise<{ uri: string; size: number; contentType: 'image/jpeg' }> {
  const ctx = ImageManipulator.manipulate(uri);
  const probe = await ctx.renderAsync();
  const { width, height } = probe;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const ctx2 = ImageManipulator.manipulate(uri);
  if (scale < 1)
    ctx2.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
  const img = await ctx2.renderAsync();
  const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.78 });
  const dir = photosDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, `${uuidv7()}.jpg`);
  new File(saved.uri).move(dest);
  return { uri: dest.uri, size: dest.size ?? 0, contentType: 'image/jpeg' };
}

/** Attach a photo to a recipe: shown immediately, uploaded in the background. */
export async function attachPhoto(recipeId: string, uri: string) {
  const s = runtime.session;
  if (!s) return;
  const prepared = await preparePhoto(uri);
  const previous = s.store.localPhoto(recipeId);
  await s.store.queuePhoto({
    localUri: prepared.uri,
    recipeId,
    contentType: prepared.contentType,
    size: prepared.size,
  });
  if (previous) {
    try {
      new File(previous.localUri).delete();
    } catch {
      /* already gone */
    }
  }
  runtime.scheduleSync(200);
}

export async function removePhoto(recipeId: string) {
  const s = runtime.session;
  if (!s) return;
  const local = s.store.localPhoto(recipeId);
  if (local) {
    await s.store.dropPhoto(recipeId);
    try {
      new File(local.localUri).delete();
    } catch {
      /* already gone */
    }
  }
  const r = s.repos.recipe(recipeId);
  if (r?.data.photoKey) await s.repos.updateRecipe(recipeId, { photoKey: null });
}
