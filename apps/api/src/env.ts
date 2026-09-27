import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(90),
  /** Public base URL of the API (used in links and local media URLs). */
  API_PUBLIC_URL: z.url(),
  /** Public web base URL for share links, e-mail links and legal pages (usually the same host). */
  WEB_PUBLIC_URL: z.url(),
  TRUST_PROXY: bool.default(false),

  STORAGE_DRIVER: z.enum(['s3', 'local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('.storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Public CDN base URL serving the bucket (e.g. https://media.pepperedapron.app). */
  MEDIA_PUBLIC_URL: z.string().optional(),

  MAIL_DRIVER: z.enum(['console', 'resend', 'memory']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('PepperedApron <hello@pepperedapron.app>'),

  PUSH_DRIVER: z.enum(['expo', 'memory', 'none']).default('none'),
  EXPO_ACCESS_TOKEN: z.string().optional(),

  APPLE_AUDIENCES: z.string().default('app.pepperedapron'),
  GOOGLE_CLIENT_IDS: z.string().default(''),
  FACEBOOK_APP_ID: z.string().default(''),
  FACEBOOK_APP_SECRET: z.string().default(''),

  APPLE_TEAM_ID: z.string().default('TEAMID1234'),
  IOS_BUNDLE_ID: z.string().default('app.pepperedapron'),
  ANDROID_PACKAGE: z.string().default('app.pepperedapron'),
  ANDROID_SHA256_CERT_FINGERPRINTS: z.string().default(''),
  APP_STORE_URL: z.string().default('https://apps.apple.com/app/pepperedapron'),
  PLAY_STORE_URL: z.string().default('https://play.google.com/store/apps/details?id=app.pepperedapron'),

  /** Remote-configurable ad placement settings (JSON). */
  ADS_CONFIG: z.string().default('{"enabled":true,"homeNativeAfterSection":3,"searchNativeEvery":8,"interstitialMinMinutes":0}'),
  MIN_APP_VERSION: z.string().default('2.0.0'),
  RATE_LIMIT_ENABLED: bool.default(true),
  ADMIN_EMAILS: z.string().default(''),
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  const env = parsed.data;
  if (env.STORAGE_DRIVER === 's3' && (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY || !env.MEDIA_PUBLIC_URL)) {
    throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and MEDIA_PUBLIC_URL');
  }
  if (env.MAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) throw new Error('MAIL_DRIVER=resend requires RESEND_API_KEY');
  if ((env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') && env.STORAGE_DRIVER === 'local') {
    throw new Error('Local storage is not allowed in staging/production');
  }
  return env;
}

export const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
