import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { fetch as expoFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { uuidv7 } from '@pepperedapron/core';
import { photosDir } from './icloud';

export type PhotoSource = 'camera' | 'library' | 'files';
export type PickResult = { uri: string } | { denied: true } | null;
export type PickManyResult = { uris: string[] } | { denied: true } | null;

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

/** Several pictures at once (screenshots of a carousel, pages of a book); up to `limit`. */
export async function pickImages(source: PhotoSource, limit = 10): Promise<PickManyResult> {
  if (source !== 'library') {
    const one = await pickImage(source);
    return one && 'uri' in one ? { uris: [one.uri] } : one;
  }
  const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!p.granted && p.accessPrivileges !== 'limited') return { denied: true };
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
    allowsMultipleSelection: true,
    selectionLimit: limit,
    orderedSelection: true,
  });
  return r.canceled || !r.assets.length ? null : { uris: r.assets.map((a) => a.uri) };
}

/**
 * Resize (max 1600 px), re-encode as JPEG (strips EXIF/GPS) and keep it in the app's photo
 * folder. Returns the photo key (its file name), which recipes store. Huge or corrupt images throw.
 */
export async function preparePhoto(uri: string): Promise<string> {
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
  const key = `${uuidv7()}.jpg`;
  await new File(saved.uri).move(new File(dir, key));
  return key;
}

/** Download a remote picture (found by an importer) into the app's photo folder. */
/** A picture that does not come in this time is skipped: the recipe is saved without it. */
const PHOTO_TIMEOUT_MS = 20_000;

export async function photoFromUrl(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PHOTO_TIMEOUT_MS);
  let bytes: Uint8Array;
  try {
    const res = await expoFetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    bytes = await res.bytes();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  const tmp = new File(Paths.cache, `${uuidv7()}.jpg`);
  tmp.write(bytes);
  try {
    return await preparePhoto(tmp.uri);
  } finally {
    if (tmp.exists) tmp.delete();
  }
}
