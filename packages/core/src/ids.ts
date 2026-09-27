/**
 * Identifier helpers. IDs are generated on the device so records can be created offline.
 * - uuidv7: time-ordered random ids for new records.
 * - uuidv5: deterministic ids for "natural key" rows (favorites, collection items, default
 *   shopping categories) so two offline devices never create duplicates.
 * Pure JS (no node:crypto) so it runs in React Native.
 */

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function bytesToUuid(b: Uint8Array): string {
  const h = (i: number) => HEX[b[i]!]!;
  return (
    h(0) +
    h(1) +
    h(2) +
    h(3) +
    '-' +
    h(4) +
    h(5) +
    '-' +
    h(6) +
    h(7) +
    '-' +
    h(8) +
    h(9) +
    '-' +
    h(10) +
    h(11) +
    h(12) +
    h(13) +
    h(14) +
    h(15)
  );
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (!c?.getRandomValues) throw new Error('Secure random generator unavailable');
  c.getRandomValues(out);
  return out;
}

let lastMs = 0;
let seq = 0;

/** RFC 9562 UUIDv7 (monotonic within the same millisecond). */
export function uuidv7(now: number = Date.now()): string {
  const b = randomBytes(16);
  let ms = Math.max(now, lastMs);
  if (ms === lastMs) {
    seq++;
    if (seq > 0xfff) {
      ms++;
      seq = ((b[6]! & 0x07) << 8) | b[7]!;
    }
  } else {
    // Start in the lower half so many ids per millisecond stay ordered.
    seq = ((b[6]! & 0x07) << 8) | b[7]!;
  }
  lastMs = ms;
  const t = BigInt(ms);
  for (let i = 0; i < 6; i++) b[i] = Number((t >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = 0x70 | ((seq >> 8) & 0x0f);
  b[7] = seq & 0xff;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return bytesToUuid(b);
}

function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return new Uint8Array(out);
}

function sha1(data: Uint8Array): Uint8Array {
  const ml = data.length * 8;
  const withOne = data.length + 1;
  const total = Math.ceil((withOne + 8) / 64) * 64;
  const msg = new Uint8Array(total);
  msg.set(data);
  msg[data.length] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(total - 8, Math.floor(ml / 2 ** 32));
  view.setUint32(total - 4, ml >>> 0);
  let h0 = 0x67452301,
    h1 = 0xefcdab89,
    h2 = 0x98badcfe,
    h3 = 0x10325476,
    h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h));
  return out;
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Namespace for all PepperedApron deterministic ids. */
export const PA_NAMESPACE = '6f1c7c1e-3f0a-4d5e-9a57-5c1d2b8e7a10';

/** RFC 4122 UUIDv5. */
export function uuidv5(name: string, namespace: string = PA_NAMESPACE): string {
  const ns = uuidToBytes(namespace);
  const nameBytes = utf8(name);
  const buf = new Uint8Array(ns.length + nameBytes.length);
  buf.set(ns);
  buf.set(nameBytes, ns.length);
  const hash = sha1(buf).slice(0, 16);
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  return bytesToUuid(hash);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

export const favoriteId = (userId: string, recipeId: string) =>
  uuidv5(`favorite:${userId}:${recipeId}`);
export const collectionItemId = (collectionId: string, recipeId: string) =>
  uuidv5(`collection-item:${collectionId}:${recipeId}`);
export const shoppingCategoryId = (userId: string, key: string) =>
  uuidv5(`shopping-category:${userId}:${key}`);

export { sha1 as _sha1ForTests };
