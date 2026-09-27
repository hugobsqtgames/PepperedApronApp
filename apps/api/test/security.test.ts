import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isPrivateAddress, safeFetch, SafeFetchError } from '../src/lib/safeFetch';
import { sniffImage } from '../src/routes/media';
import { createTestApp, register, type TestCtx } from './helpers';

describe('rate limiting (brute force protection)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp({ RATE_LIMIT_ENABLED: 'true' });
  });
  afterAll(async () => ctx.close());

  it('locks login attempts for an e-mail after 10 tries', async () => {
    const c = await register(ctx);
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await ctx.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: c.email, password: `wrong-password-${i}` },
      });
      codes.push(r.statusCode);
    }
    expect(codes.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: c.email, password: 'correct horse battery' },
    });
    expect(r.statusCode).toBe(429);
    expect(r.json().error.code).toBe('rate_limited');
  });

  it('limits password-reset e-mails', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i++)
      codes.push(
        (
          await ctx.app.inject({
            method: 'POST',
            url: '/v1/auth/password/forgot',
            payload: { email: 'victim@example.com' },
          })
        ).statusCode,
      );
    expect(codes.filter((s) => s === 429).length).toBeGreaterThanOrEqual(2);
  });
});

describe('SSRF protection', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '172.16.3.4',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '224.0.0.1',
  ])('%s is private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('%s is public', (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );

  it.each([
    'http://127.0.0.1/',
    'http://localhost/',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
    'http://example.com:22/',
    'ftp://example.com',
    'http://user:pw@example.com',
    'http://metadata.google.internal/',
  ])('refuses %s', async (url) => {
    await expect(safeFetch(url)).rejects.toBeInstanceOf(SafeFetchError);
  });
});

describe('upload content sniffing', () => {
  it('recognises real images and rejects everything else', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toBe('image/jpeg');
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(sniffImage(Buffer.from('RIFF0000WEBPVP8 '))).toBe('image/webp');
    expect(sniffImage(Buffer.from('\0\0\0\x18ftypheic'))).toBe('image/heic');
    expect(sniffImage(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});
