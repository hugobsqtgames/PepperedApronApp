import i18n from '../i18n';
import { recognizeText, textVisionAvailable, type VisionLine } from '../../modules/text-vision';

/**
 * On-device text recognition (Apple Vision). Nothing leaves the phone. The app's own module
 * reads handwriting and French accents (languages set, "accurate" level, language correction);
 * builds without it fall back to expo-text-extractor (printed English-first text).
 */
export async function ocrSupported(): Promise<boolean> {
  if (textVisionAvailable) return true;
  try {
    const m = await import('expo-text-extractor');
    return m.isSupported;
  } catch {
    return false;
  }
}

/** Languages to read, the app's first (a French recipe card, an English blog screenshot). */
function languages(): string[] {
  return i18n.language.startsWith('en') ? ['en-US', 'fr-FR'] : ['fr-FR', 'en-US'];
}

/** The lines of a picture with their position (receipts are read row by row), or null. */
export async function readTextLines(uri: string): Promise<VisionLine[] | null> {
  if (!textVisionAvailable) return null;
  return recognizeText(uri, languages());
}

export async function readTextFromImage(uri: string): Promise<string> {
  if (textVisionAvailable) {
    const lines = await recognizeText(uri, languages());
    return lines
      .map((l) => l.text)
      .join('\n')
      .trim();
  }
  const m = await import('expo-text-extractor');
  const lines = await m.extractTextFromImage(uri);
  return lines.join('\n').trim();
}
