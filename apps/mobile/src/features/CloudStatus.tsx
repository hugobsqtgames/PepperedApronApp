import type { TFunction } from 'i18next';
import type { CloudSnapshot } from '@pepperedapron/client';
import { formatRelativeTime } from '../lib/format';
import { CLOUD_SUPPORTED } from '../services/runtime';
import type { IconName } from '../ui';

/** One sentence describing where the data is and whether iCloud is up to date. */
export function cloudStatusText(s: CloudSnapshot, t: TFunction, locale?: string): string {
  if (!CLOUD_SUPPORTED) return t('cloud.androidLocal');
  switch (s.status) {
    case 'off':
      return t('cloud.statusOff');
    case 'unavailable':
      return t('cloud.statusUnavailable');
    case 'error':
      return t('cloud.statusError');
    case 'syncing':
      return t('cloud.statusSyncing');
    case 'idle':
      return s.lastSyncedAt
        ? t('cloud.statusSynced', { time: formatRelativeTime(s.lastSyncedAt, t, locale) })
        : t('cloud.statusSyncing');
  }
}

export function cloudStatusIcon(s: CloudSnapshot): IconName {
  if (!CLOUD_SUPPORTED || s.status === 'off') return 'phone-portrait-outline';
  if (s.status === 'unavailable' || s.status === 'error') return 'cloud-offline-outline';
  return 'cloud-done-outline';
}
