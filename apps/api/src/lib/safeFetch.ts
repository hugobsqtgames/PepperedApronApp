import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';

export interface SafeFetchResult {
  status: number;
  url: string;
  contentType: string | null;
  body: string;
}

export type SafeFetch = (url: string, opts?: { maxBytes?: number; timeoutMs?: number; accept?: string }) => Promise<SafeFetchResult>;

export class SafeFetchError extends Error {
  constructor(public readonly code: 'invalid_url' | 'blocked_address' | 'too_large' | 'timeout' | 'too_many_redirects' | 'network') {
    super(code);
  }
}

/** True for addresses that must never be reached from the server (SSRF protection). */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith('64:ff9b:') || v.startsWith('2001:db8');
  }
  return true;
}

function safeLookup(hostname: string, options: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, '', 4);
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      return cb(Object.assign(new Error('blocked_address'), { code: 'EBLOCKED' }), '', 4);
    }
    if (options.all) return cb(null, list);
    cb(null, list[0]!.address, list[0]!.family);
  });
}

function validateUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SafeFetchError('invalid_url');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new SafeFetchError('invalid_url');
  if (u.username || u.password) throw new SafeFetchError('invalid_url');
  if (u.port && !['80', '443'].includes(u.port)) throw new SafeFetchError('blocked_address');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isPrivateAddress(host)) throw new SafeFetchError('blocked_address');
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw new SafeFetchError('blocked_address');
  return u;
}

function once(u: URL, accept: string, maxBytes: number, timeoutMs: number): Promise<{ status: number; location?: string; contentType: string | null; body: string }> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      u,
      {
        method: 'GET',
        lookup: safeLookup as unknown as typeof dns.lookup,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PepperedApronBot/2.0; +https://pepperedapron.app/bot)',
          Accept: accept,
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'fr,en;q=0.8,es;q=0.6,de;q=0.6,it;q=0.6',
        },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location, contentType: null, body: '' });
        }
        const enc = String(res.headers['content-encoding'] ?? '');
        const stream = enc.includes('br') ? res.pipe(zlib.createBrotliDecompress()) : enc.includes('gzip') ? res.pipe(zlib.createGunzip()) : enc.includes('deflate') ? res.pipe(zlib.createInflate()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy();
            reject(new SafeFetchError('too_large'));
            return;
          }
          chunks.push(c);
        });
        stream.on('end', () => resolve({ status, contentType: (res.headers['content-type'] as string) ?? null, body: Buffer.concat(chunks).toString('utf8') }));
        stream.on('error', () => reject(new SafeFetchError('network')));
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new SafeFetchError('timeout'));
    });
    req.on('error', (e: NodeJS.ErrnoException) => reject(new SafeFetchError(e.code === 'EBLOCKED' || e.message === 'blocked_address' ? 'blocked_address' : 'network')));
    req.end();
  });
}

/** Fetch an external URL with SSRF protection (every redirect hop and DNS answer is checked). */
export const safeFetch: SafeFetch = async (raw, opts = {}) => {
  const maxBytes = opts.maxBytes ?? 3 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const accept = opts.accept ?? 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5';
  let u = validateUrl(raw);
  for (let hop = 0; hop < 6; hop++) {
    const r = await once(u, accept, maxBytes, timeoutMs);
    if (r.location) {
      u = validateUrl(new URL(r.location, u).toString());
      continue;
    }
    return { status: r.status, url: u.toString(), contentType: r.contentType, body: r.body };
  }
  throw new SafeFetchError('too_many_redirects');
};
