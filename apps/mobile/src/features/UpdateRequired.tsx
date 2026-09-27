import { Linking, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RemoteConfig } from '@pepperedapron/client';
import { EmptyState } from '../ui';
import { Screen } from '../ui/Screen';

/**
 * Shown instead of the app when the server no longer supports this version (breaking API
 * change). Local data stays on the device and syncs again after the update.
 */
export function UpdateRequired({ config }: { config: RemoteConfig }) {
  const { t } = useTranslation();
  const url = Platform.OS === 'ios' ? config.stores.ios : config.stores.android;
  return (
    <Screen>
      <EmptyState
        emoji="🆕"
        title={t('update.title')}
        body={t('update.body')}
        action={t('update.action')}
        onAction={() => void Linking.openURL(url)}
        testID="update-required"
      />
    </Screen>
  );
}
