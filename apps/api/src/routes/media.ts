import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { uuidv7 } from '@pepperedapron/core';
import { z } from 'zod';
import type { RouteCtx } from '../app';
import { uploads } from '../db/schema';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { LocalStorage } from '../services/storage';

const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Magic-number check: the declared content type must match the bytes. */
export function sniffImage(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 4, 8) === 'ftyp' &&
    /^(heic|heix|mif1|msf1|hevc)/.test(buf.toString('ascii', 8, 12))
  )
    return 'image/heic';
  return null;
}

export async function mediaRoutes(app: FastifyInstance, { deps, requireAuth }: RouteCtx) {
  app.post(
    '/uploads',
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const a = await requireAuth(req);
      const b = parse(
        z
          .object({
            contentType: z.enum(Object.keys(TYPES) as [string, ...string[]]),
            size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
          })
          .strict(),
        req.body,
      );
      const key = `u/${a.userId}/${uuidv7()}.${TYPES[b.contentType]}`;
      const [row] = await deps.db
        .insert(uploads)
        .values({ ownerId: a.userId, key, contentType: b.contentType, maxBytes: b.size })
        .returning();
      const presigned = await deps.storage.presignPut(key, b.contentType, b.size);
      reply.status(201);
      return { uploadId: row!.id, key, ...presigned };
    },
  );

  app.post('/uploads/:id/complete', async (req) => {
    const a = await requireAuth(req);
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const up = await deps.db.query.uploads.findFirst({
      where: and(eq(uploads.id, id), eq(uploads.ownerId, a.userId)),
    });
    if (!up) throw notFound();
    if (up.status === 'ready')
      return { key: up.key, url: `${deps.storage.publicBaseUrl()}/${up.key}` };
    const head = await deps.storage.head(up.key);
    if (!head) throw badRequest('upload_missing');
    if (
      head.size > MAX_UPLOAD_BYTES ||
      head.size > up.maxBytes * 1.05 + 1024 ||
      (head.contentType && head.contentType !== up.contentType)
    ) {
      await deps.storage.delete(up.key);
      await deps.db.delete(uploads).where(eq(uploads.id, up.id));
      throw badRequest('upload_invalid');
    }
    await deps.db
      .update(uploads)
      .set({ status: 'ready', sizeBytes: head.size })
      .where(eq(uploads.id, up.id));
    return { key: up.key, url: `${deps.storage.publicBaseUrl()}/${up.key}` };
  });

  // ---- local storage driver endpoints (development & tests only)
  if (deps.storage instanceof LocalStorage) {
    const local = deps.storage;
    app.addContentTypeParser(
      ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/octet-stream'],
      { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES + 1 },
      (_req, body, done) => done(null, body),
    );
    app.put('/media-upload', { bodyLimit: MAX_UPLOAD_BYTES + 1 }, async (req, reply) => {
      const q = parse(
        z.object({
          key: z.string().max(300),
          ct: z.string(),
          max: z.coerce.number(),
          exp: z.coerce.number(),
          sig: z.string(),
        }),
        req.query,
      );
      if (!local.verify(q.key, q.ct, q.max, q.exp, q.sig)) throw forbidden('invalid_signature');
      if (req.headers['content-type'] !== q.ct) throw forbidden('content_type_mismatch');
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('empty_body');
      if (body.length > q.max) throw new AppError(413, 'payload_too_large');
      if (sniffImage(body) !== q.ct) throw badRequest('not_an_image');
      await local.write(q.key, body, q.ct);
      reply.status(200);
      return { ok: true };
    });
    app.get('/media/*', async (req, reply) => {
      const key = (req.params as { '*': string })['*'];
      if (!/^u\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|heic)$/.test(key)) throw notFound();
      const f = await local.read(key);
      if (!f) throw notFound();
      reply
        .header('Content-Type', f.contentType)
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .header('X-Content-Type-Options', 'nosniff');
      return reply.send(f.data);
    });
  }
}
