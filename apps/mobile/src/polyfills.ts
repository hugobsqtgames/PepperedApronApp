import { getRandomValues } from 'expo-crypto';
// React Native's own URL is partial (it accepts anything, keeps "HTTPS://Site.COM" as is): the
// link importers, duplicate detection and validation need the standard behaviour, as in tests.
import 'react-native-url-polyfill/auto';

/**
 * Hermes (the app's JavaScript engine on iOS) has no Web Crypto: identifiers (core uuidv7) need
 * crypto.getRandomValues. It is provided by the system's secure generator (expo-crypto). Loaded
 * before anything else (index.ts).
 */
export function installCrypto(g: { crypto?: { getRandomValues?: unknown } } = globalThis) {
  if (typeof g.crypto?.getRandomValues === 'function') return;
  const fill = <T extends Uint8Array>(a: T): T => getRandomValues(a);
  if (g.crypto) g.crypto.getRandomValues = fill;
  else g.crypto = { getRandomValues: fill };
}

installCrypto();
