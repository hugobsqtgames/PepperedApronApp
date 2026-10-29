/**
 * Maps custom-scheme links (pepperedapron://…, used by widgets and Live Activities) onto app
 * routes. Unknown paths fall through unchanged (expo-router shows the not-found screen).
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // Share extension deep link (expo-share-intent) is handled by its provider.
    if (path.includes('dataUrl=')) return '/';
    return path;
  } catch {
    return '/';
  }
}
