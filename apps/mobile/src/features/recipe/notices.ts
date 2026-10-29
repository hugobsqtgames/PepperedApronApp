import type { TFunction } from 'i18next';
import type { ImportResult, ReviewNotice } from '@pepperedapron/core';
import type { VideoListenError } from '../../services/importer';

/** Notices that ask the user to complete or fix something (shown in the accent colour). */
export const WARNING_NOTICES = new Set<ReviewNotice>([
  'minimal',
  'instagram',
  'listenPermission',
  'listenLanguage',
  'listenFailed',
]);

/** What to check in an imported recipe, by how it was imported. */
export function noticeText(n: ReviewNotice, t: TFunction): string {
  switch (n) {
    case 'full':
      return t('import.full');
    case 'minimal':
      return t('import.minimal');
    case 'partial':
      return t('import.partial');
    case 'speech':
      return t('import.speech');
    case 'instagram':
      return t('import.instagramPrivate');
    case 'listenPermission':
      return t('import.listenPermission');
    case 'listenLanguage':
      return t('import.listenLanguage');
    case 'listenFailed':
      return t('import.listenFailed');
    case 'dictation':
      return t('import.dictation');
    default:
      return t('editor.importedNotice');
  }
}

/** Notice shown in the editor for a link import. */
export function linkNotice(
  res: ImportResult,
  listenError: VideoListenError | null = null,
): ReviewNotice {
  if (res.fromSpeech) return 'speech';
  if (listenError === 'permission') return 'listenPermission';
  if (listenError === 'language') return 'listenLanguage';
  if (listenError) return 'listenFailed';
  if (res.platform === 'instagram' && res.completeness === 'minimal') return 'instagram';
  return res.completeness;
}
