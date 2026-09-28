import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env';

const prod = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://db/pa',
  JWT_SECRET: 'x'.repeat(48),
  API_PUBLIC_URL: 'https://api.pepperedapron.app',
  WEB_PUBLIC_URL: 'https://pepperedapron.app',
  STORAGE_DRIVER: 's3',
  S3_BUCKET: 'media',
  S3_ACCESS_KEY_ID: 'k',
  S3_SECRET_ACCESS_KEY: 's',
  MEDIA_PUBLIC_URL: 'https://media.pepperedapron.app',
  MAIL_DRIVER: 'resend',
  RESEND_API_KEY: 're_x',
  APPLE_TEAM_ID: 'ABCDE12345',
  LEGAL_PUBLISHER: 'PepperedApron',
  LEGAL_ADDRESS: 'Paris',
  LEGAL_CONTACT_EMAIL: 'legal@pepperedapron.app',
  LEGAL_HOSTING: 'Hébergeur',
};

describe('environment validation', () => {
  it('accepts a complete production configuration', () => {
    expect(loadEnv(prod).NODE_ENV).toBe('production');
  });

  it.each([
    ['console e-mails', { MAIL_DRIVER: 'console' }, /MAIL_DRIVER=resend/],
    ['placeholder Apple team', { APPLE_TEAM_ID: 'TEAMID1234' }, /APPLE_TEAM_ID/],
    ['example JWT secret', { JWT_SECRET: 'change-me-change-me-change-me-change-me' }, /JWT_SECRET/],
    ['short JWT secret', { JWT_SECRET: 'short' }, /JWT_SECRET/],
    ['local storage', { STORAGE_DRIVER: 'local' }, /Local storage/],
    ['missing legal notice', { LEGAL_PUBLISHER: '' }, /LEGAL_PUBLISHER/],
    ['incomplete S3', { S3_BUCKET: '' }, /S3_BUCKET/],
  ])('refuses %s in production', (_name, patch, message) => {
    expect(() => loadEnv({ ...prod, ...patch })).toThrow(message);
  });

  it('keeps development frictionless', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgres://localhost/pa',
        JWT_SECRET: 'change-me-change-me-change-me-change-me',
        API_PUBLIC_URL: 'http://localhost:3000',
        WEB_PUBLIC_URL: 'http://localhost:3000',
      }),
    ).not.toThrow();
  });
});
