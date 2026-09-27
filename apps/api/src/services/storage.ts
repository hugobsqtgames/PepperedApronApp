import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Env } from '../env';

export interface PresignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

export interface Storage {
  presignPut(key: string, contentType: string, maxBytes: number): Promise<PresignedUpload>;
  head(key: string): Promise<{ size: number; contentType: string | null } | null>;
  delete(key: string): Promise<void>;
  copy(srcKey: string, destKey: string): Promise<boolean>;
  publicBaseUrl(): string;
}

const EXPIRES = 15 * 60;

export class S3Storage implements Storage {
  private readonly client: S3Client;
  constructor(private readonly env: Env) {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: !!env.S3_ENDPOINT,
    });
  }
  async presignPut(key: string, contentType: string, maxBytes: number): Promise<PresignedUpload> {
    // Content-Type is signed; size is verified after upload (HEAD) and rejected if too big.
    const cmd = new PutObjectCommand({
      Bucket: this.env.S3_BUCKET!,
      Key: key,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });
    const url = await getSignedUrl(this.client, cmd, {
      expiresIn: EXPIRES,
      signableHeaders: new Set(['content-type']),
    });
    void maxBytes;
    return {
      url,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      expiresAt: new Date(Date.now() + EXPIRES * 1000).toISOString(),
    };
  }
  async head(key: string) {
    try {
      const r = await this.client.send(
        new HeadObjectCommand({ Bucket: this.env.S3_BUCKET!, Key: key }),
      );
      return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? null };
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET!, Key: key }));
  }
  async copy(srcKey: string, destKey: string) {
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.env.S3_BUCKET!,
          Key: destKey,
          CopySource: `${this.env.S3_BUCKET}/${encodeURIComponent(srcKey)}`,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
  publicBaseUrl() {
    return this.env.MEDIA_PUBLIC_URL!.replace(/\/+$/, '');
  }
}

/**
 * Development/test driver: files are stored on disk and uploaded to the API itself through a
 * short-lived HMAC-signed URL, mimicking S3 presigned PUT semantics.
 */
export class LocalStorage implements Storage {
  private readonly dir: string;
  constructor(private readonly env: Env) {
    this.dir = path.resolve(env.STORAGE_LOCAL_DIR);
  }
  private sign(key: string, contentType: string, maxBytes: number, exp: number): string {
    return createHmac('sha256', this.env.JWT_SECRET)
      .update(`${key}|${contentType}|${maxBytes}|${exp}`)
      .digest('base64url');
  }
  verify(key: string, contentType: string, maxBytes: number, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
    const expected = Buffer.from(this.sign(key, contentType, maxBytes, exp));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
  filePath(key: string): string {
    const p = path.resolve(this.dir, key);
    if (!p.startsWith(this.dir + path.sep)) throw new Error('invalid key');
    return p;
  }
  async presignPut(key: string, contentType: string, maxBytes: number): Promise<PresignedUpload> {
    const exp = Math.floor(Date.now() / 1000) + EXPIRES;
    const q = new URLSearchParams({
      key,
      ct: contentType,
      max: String(maxBytes),
      exp: String(exp),
      sig: this.sign(key, contentType, maxBytes, exp),
    });
    return {
      url: `${this.env.API_PUBLIC_URL.replace(/\/+$/, '')}/v1/media-upload?${q}`,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }
  async write(key: string, data: Buffer, contentType: string) {
    const p = this.filePath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
    await fs.writeFile(`${p}.meta`, JSON.stringify({ contentType }));
  }
  async head(key: string) {
    try {
      const p = this.filePath(key);
      const st = await fs.stat(p);
      const meta = JSON.parse(await fs.readFile(`${p}.meta`, 'utf8')) as { contentType: string };
      return { size: st.size, contentType: meta.contentType };
    } catch {
      return null;
    }
  }
  async read(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    const h = await this.head(key);
    if (!h) return null;
    return {
      data: await fs.readFile(this.filePath(key)),
      contentType: h.contentType ?? 'application/octet-stream',
    };
  }
  async delete(key: string) {
    const p = this.filePath(key);
    await fs.rm(p, { force: true });
    await fs.rm(`${p}.meta`, { force: true });
  }
  async copy(srcKey: string, destKey: string) {
    const src = await this.read(srcKey);
    if (!src) return false;
    await this.write(destKey, src.data, src.contentType);
    return true;
  }
  publicBaseUrl() {
    return `${this.env.API_PUBLIC_URL.replace(/\/+$/, '')}/v1/media`;
  }
}

export function createStorage(env: Env): Storage {
  return env.STORAGE_DRIVER === 's3' ? new S3Storage(env) : new LocalStorage(env);
}
