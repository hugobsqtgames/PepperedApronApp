/**
 * Deterministic generators for property and fuzz tests: every case comes from a numbered seed,
 * so a failure is reproduced with the seed printed in the test name.
 */
let created = 0;
/** Generated cases so far in this test file (one generator per seed), for the QA counts. */
export const casesRun = () => created;

export function rng(seed: number) {
  created++;
  let s = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(a: readonly T[]): T => a[int(0, a.length - 1)]!;
  const bool = (p = 0.5) => next() < p;
  const ALPHA = 'abcdefghijklmnopqrstuvwxyzéèêàçôœÉ ';
  const NASTY = [
    '',
    ' ',
    '\n',
    '\t',
    '\u0000',
    '​',
    '﻿',
    '🍅',
    '👩‍🍳',
    '½',
    '¼',
    '⅓',
    '-',
    '–',
    '/',
    '\\',
    '"',
    "'",
    '’',
    '<',
    '>',
    '&amp;',
    '&#39;',
    '{',
    '}',
    '[',
    ']',
    '(',
    ')',
    '%',
    '$',
    '€',
    '°',
    '…',
    '٣',
    '漢',
    'İ',
    'ß',
    '‮',
    'NaN',
    'Infinity',
    '1e309',
    '-0',
    '0x1F',
    '999999999999',
  ];
  const word = (n = int(1, 10)) =>
    Array.from({ length: n }, () => ALPHA[int(0, ALPHA.length - 1)]).join('');
  /** Any string: letters, numbers, units, punctuation, emoji, control characters. */
  const junk = (max = 60) =>
    Array.from({ length: int(0, max) }, () =>
      pick([
        () => word(),
        () => String(int(0, 5000)),
        () => `${int(0, 99)},${int(0, 9)}`,
        () => pick(NASTY),
        () => pick(['g', 'kg', 'ml', 'cl', 'l', 'c. à soupe', 'tbsp', 'cup', 'oz', 'lb', 'pincée']),
        () => String.fromCharCode(int(0, 0xffff)),
      ])(),
    ).join(pick(['', ' ', ' ', '\n']));
  return { next, int, pick, bool, word, junk };
}
export type Rng = ReturnType<typeof rng>;

/** Seeds 1…n, to use with it.each: one generated case per seed. */
export const seeds = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);
