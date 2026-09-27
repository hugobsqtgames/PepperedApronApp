/** On-device text recognition (Apple Vision / Google ML Kit). Nothing leaves the phone. */
export async function ocrSupported(): Promise<boolean> {
  try {
    const m = await import('expo-text-extractor');
    return m.isSupported;
  } catch {
    return false;
  }
}

export async function readTextFromImage(uri: string): Promise<string> {
  const m = await import('expo-text-extractor');
  const lines = await m.extractTextFromImage(uri);
  return lines.join('\n').trim();
}
