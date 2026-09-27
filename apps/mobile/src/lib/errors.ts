import type { TFunction } from 'i18next';
import { ApiError, NetworkError, ValidationError } from '@pepperedapron/client';

const KNOWN = new Set([
  'server_unavailable', 'session_expired', 'rate_limited', 'invalid_credentials', 'email_in_use', 'email_in_use_sign_in_with_password',
  'invalid_or_expired_token', 'invalid_invite', 'already_in_household', 'publish_requires_verified_email', 'upload_failed',
  'not_found', 'forbidden', 'already_reported', 'fetch_blocked_address', 'fetch_invalid_url',
]);

/** Map any error to a friendly, translated sentence. Technical details never reach the UI. */
export function errorMessage(e: unknown, t: TFunction): string {
  if (e instanceof NetworkError) return t('errors.network');
  if (e instanceof ValidationError) {
    const first = e.issues[0];
    if (first?.path === 'title') return t('errors.titleRequired');
    if (first?.path === 'servings') return t('errors.servingsInvalid');
    return t('errors.invalidField');
  }
  if (e instanceof ApiError) {
    if (e.status >= 500) return t('errors.server_unavailable');
    if (e.status === 429) return t('errors.rate_limited');
    if (e.code === 'validation_error') return t('errors.invalidField');
    if (KNOWN.has(e.code)) return t(`errors.${e.code}` as never);
    if (e.status === 404) return t('errors.not_found');
    if (e.status === 403) return t('errors.forbidden');
  }
  return t('errors.generic');
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
