import type { TFunction } from 'i18next';
import { ImportFormatError, ValidationError } from '@pepperedapron/client';

/** Map any error to a friendly, translated sentence. Technical details never reach the UI. */
export function errorMessage(e: unknown, t: TFunction): string {
  if (e instanceof ValidationError) {
    const first = e.issues[0];
    if (first?.path === 'title') return t('errors.titleRequired');
    if (first?.path === 'servings') return t('errors.servingsInvalid');
    return t('errors.invalidField');
  }
  if (e instanceof ImportFormatError) return t('settings.importInvalid');
  if (e instanceof Error && e.message === 'not_found') return t('errors.not_found');
  if (e instanceof Error && /SQLITE_FULL|ENOSPC|No space left/i.test(e.message))
    return t('errors.storageFull');
  return t('errors.generic');
}

/**
 * For a change started from a tap without waiting for it. The item may have been deleted in the
 * meantime (on another device, through iCloud): there is then nothing left to change, and the
 * screen already shows it gone. Anything else is logged, never left as an unhandled rejection.
 */
export function inBackground(p: Promise<unknown>): void {
  p.catch((e: unknown) => {
    if (e instanceof Error && e.message === 'not_found') return;
    console.warn('[action] failed', e instanceof Error ? e.message : e);
  });
}
