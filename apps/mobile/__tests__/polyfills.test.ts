/*
 * Regression (found in Expo Go): Hermes has no Web Crypto, so creating any identifier threw
 * "Secure random generator unavailable" and the app could not open the user's recipes.
 */
jest.mock('expo-crypto', () => ({
  getRandomValues: <T extends Uint8Array>(a: T): T => {
    for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) & 255;
    return a;
  },
}));

import { uuidv7 } from '@pepperedapron/core';
import { installCrypto } from '../src/polyfills';

describe('crypto polyfill (Hermes)', () => {
  it('provides getRandomValues where the engine has no crypto', () => {
    const g: { crypto?: { getRandomValues?: unknown } } = {};
    installCrypto(g);
    expect(typeof g.crypto?.getRandomValues).toBe('function');
    const a = (g.crypto!.getRandomValues as (x: Uint8Array) => Uint8Array)(new Uint8Array(4));
    expect([...a]).toEqual([11, 48, 85, 122]);
  });

  it('keeps an existing secure generator', () => {
    const own = jest.fn();
    const g = { crypto: { getRandomValues: own } };
    installCrypto(g);
    expect(g.crypto.getRandomValues).toBe(own);
  });

  it('identifiers can be created once installed, without a global crypto', () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      expect(() => uuidv7()).toThrow('Secure random generator unavailable');
      installCrypto();
      expect(uuidv7()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      if (saved) Object.defineProperty(globalThis, 'crypto', saved);
    }
  });
});
