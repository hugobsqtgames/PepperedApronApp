import { describe, expect, it } from 'vitest';
import { _sha1ForTests, favoriteId, isUuid, uuidv5, uuidv7 } from './ids';

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const enc = (s: string) => new Uint8Array([...Buffer.from(s, 'utf8')]);

describe('ids', () => {
  it('sha1 matches known vectors', () => {
    expect(hex(_sha1ForTests(enc('')))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(hex(_sha1ForTests(enc('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(hex(_sha1ForTests(enc('a'.repeat(1000))))).toBe(
      '291e9a6c66994949b57ba5e650361e98fc36b1ba',
    );
  });
  it('uuidv5 matches RFC example (DNS namespace, www.example.com)', () => {
    expect(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });
  it('uuidv5 handles unicode deterministically', () => {
    expect(uuidv5('crème brûlée 🍮')).toBe(uuidv5('crème brûlée 🍮'));
    expect(isUuid(uuidv5('é'))).toBe(true);
  });
  it('uuidv7 is valid, unique and time-ordered', () => {
    const ids = Array.from({ length: 2000 }, () => uuidv7());
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(isUuid(id)).toBe(true));
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
    expect(ids[0]![14]).toBe('7');
  });
  it('deterministic natural-key ids never collide across entities', () => {
    const u = uuidv7();
    const r = uuidv7();
    expect(favoriteId(u, r)).toBe(favoriteId(u, r));
    expect(favoriteId(u, r)).not.toBe(favoriteId(r, u));
  });
  it('isUuid rejects garbage', () => {
    expect(isUuid('1')).toBe(false);
    expect(isUuid("' OR 1=1 --")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
