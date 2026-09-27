import * as SecureStore from 'expo-secure-store';
import type { TokenStore, Tokens } from '@pepperedapron/client';

const KEY = 'pa.tokens.v1';
const USER_KEY = 'pa.user.v1';

/** Tokens live in the iOS Keychain / Android Keystore, never in plain storage. */
export class SecureTokenStore implements TokenStore {
  private cache: Tokens | null | undefined;
  async get() {
    if (this.cache !== undefined) return this.cache;
    const raw = await SecureStore.getItemAsync(KEY);
    this.cache = raw ? (JSON.parse(raw) as Tokens) : null;
    return this.cache;
  }
  async set(t: Tokens) {
    this.cache = t;
    await SecureStore.setItemAsync(KEY, JSON.stringify(t), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  }
  async clear() {
    this.cache = null;
    await SecureStore.deleteItemAsync(KEY);
  }
}

export interface CachedUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  role: 'user' | 'admin';
  avatarKey: string | null;
  hasPassword: boolean;
  providers: string[];
}

export async function loadCachedUser(): Promise<CachedUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? (JSON.parse(raw) as CachedUser) : null;
}
export async function saveCachedUser(u: CachedUser | null) {
  if (u) await SecureStore.setItemAsync(USER_KEY, JSON.stringify(u));
  else await SecureStore.deleteItemAsync(USER_KEY);
}
