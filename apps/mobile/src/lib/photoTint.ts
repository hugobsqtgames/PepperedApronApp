import { useEffect, useState } from 'react';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import jpeg from 'jpeg-js';
import type { RecipeCategory } from '@pepperedapron/core';
import { CATEGORY_TINTS, dominantColor, type RGB } from './tint';

const cache = new Map<string, RGB | null>();

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Colour of a photo on the device: shrunk to a few pixels, read here. Null if unreadable. */
export async function photoColor(uri: string): Promise<RGB | null> {
  if (cache.has(uri)) return cache.get(uri)!;
  let color: RGB | null = null;
  try {
    const img = await ImageManipulator.manipulate(uri).resize({ width: 16 }).renderAsync();
    const saved = await img.saveAsync({ base64: true, format: SaveFormat.JPEG, compress: 0.9 });
    if (saved.base64) {
      const { data, width, height } = jpeg.decode(fromBase64(saved.base64), { useTArray: true });
      const px: RGB[] = [];
      for (let i = 0; i < width * height; i++)
        px.push([data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!]);
      color = dominantColor(px);
    }
  } catch {
    // Not decodable here: the page keeps the app's colours.
  }
  cache.set(uri, color);
  return color;
}

/** The dish's colour: its photo's, or else its category photo's; null for the app's colours. */
export function useDishColor(uri: string | null, category: RecipeCategory | null): RGB | null {
  const fallback = category ? CATEGORY_TINTS[category] : null;
  const [color, setColor] = useState<RGB | null>(() => (uri ? (cache.get(uri) ?? null) : null));
  useEffect(() => {
    let live = true;
    if (uri) void photoColor(uri).then((c) => live && setColor(c));
    else setColor(null);
    return () => {
      live = false;
    };
  }, [uri]);
  return color ?? fallback;
}
