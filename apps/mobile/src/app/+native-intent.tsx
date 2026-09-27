/**
 * Maps universal links (https://pepperedapron.app/…) and custom-scheme links onto app routes.
 * Unknown paths fall through unchanged (expo-router shows the not-found screen).
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const u = new URL(path, 'https://pepperedapron.app');
    const p = u.pathname;
    const token = u.searchParams.get('token');
    let m: RegExpMatchArray | null;
    if ((m = p.match(/^\/(?:r|share)\/([A-Za-z0-9_-]{16,64})$/))) return `/share/${m[1]}`;
    if ((m = p.match(/^\/(?:p|public)\/([0-9a-f-]{36})$/i))) return `/community/${m[1]}`;
    if ((m = p.match(/^\/join\/([A-Za-z0-9]{4,20})$/))) return `/join/${m[1]!.toUpperCase()}`;
    if (p === '/auth/reset-password' || p === '/reset-password')
      return `/reset-password?token=${encodeURIComponent(token ?? '')}`;
    if (p === '/auth/verify-email' || p === '/verify-email')
      return `/verify-email?token=${encodeURIComponent(token ?? '')}&kind=verify`;
    if (p === '/auth/confirm-email')
      return `/verify-email?token=${encodeURIComponent(token ?? '')}&kind=change`;
    // Share extension deep link (expo-share-intent) is handled by its provider.
    if (p.includes('dataUrl=')) return '/';
    return path;
  } catch {
    return '/';
  }
}
