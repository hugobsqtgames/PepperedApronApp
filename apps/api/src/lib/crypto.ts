import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string | Buffer, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // Always spend the same time, even when the account has no password (OAuth-only) or is unknown.
  const parts = stored?.split('$') ?? [];
  const valid = parts.length === 6 && parts[0] === 'scrypt';
  const n = valid ? Number(parts[1]) : N;
  const r = valid ? Number(parts[2]) : R;
  const p = valid ? Number(parts[3]) : P;
  const salt = valid ? Buffer.from(parts[4]!, 'base64url') : randomBytes(16);
  const expected = valid ? Buffer.from(parts[5]!, 'base64url') : randomBytes(KEYLEN);
  const actual = await scrypt(password.normalize('NFKC'), salt, expected.length, { N: n, r, p, maxmem: MAXMEM });
  return valid && actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Human-friendly invite code (no ambiguous characters). */
export function inviteCode(len = 8): string {
  const b = randomBytes(len);
  return Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}
