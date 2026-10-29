import { useState } from 'react';
import { Alert, Linking, ScrollView, Share, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import { exportData, ImportFormatError, importData } from '@pepperedapron/client';
import { cloudStatusText } from '../../../features/CloudStatus';
import { useCloudStatus, useRuntime, useSession } from '../../../hooks/runtime';
import { errorMessage } from '../../../lib/errors';
import { space } from '../../../theme/tokens';
import { Button, Group, ListRow, Text, TextField, useToast } from '../../../ui';

/**
 * Where the data lives (this device + the user's iCloud), and full control over it: export,
 * import (backup, moving to another phone) and deletion.
 */
export default function DataScreen() {
  const { t, i18n } = useTranslation();
  const rt = useRuntime();
  const { store } = useSession();
  const cloud = useCloudStatus();
  const toast = useToast();
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const doExport = async () => {
    try {
      const data = await exportData(store);
      const f = new File(
        Paths.cache,
        `pepperedapron-${new Date().toISOString().slice(0, 10)}.json`,
      );
      f.write(JSON.stringify(data, null, 2));
      await Share.share({ url: f.uri, title: 'PepperedApron' });
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  const doImport = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'public.json', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (r.canceled || !r.assets[0]) return;
      const count = await importData(store, await new File(r.assets[0].uri).text());
      toast(t('settings.importDone', { count }));
    } catch (e) {
      toast(e instanceof ImportFormatError ? t('settings.importInvalid') : errorMessage(e, t), {
        tone: 'error',
      });
    }
  };

  const del = () =>
    Alert.alert(
      t('settings.deleteAll'),
      rt.cloudEnabled ? t('settings.deleteAllCloud') : t('settings.deleteAllBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              // Preferences (theme, language…) are kept; everything the user created goes.
              await store.removeAll(['settings']);
              setConfirm('');
              toast(t('settings.deleteAllDone'));
              rt.scheduleSync(0);
            } catch (e) {
              toast(errorMessage(e, t), { tone: 'error' });
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: space.lg,
        gap: space.xl,
        maxWidth: 640,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      <View style={{ gap: space.sm }}>
        <Text variant="title3">{t('cloud.title')}</Text>
        <Text color="textMuted">{t('cloud.body')}</Text>
      </View>
      <Group>
        <ListRow
          icon="cloud-outline"
          title={t('cloud.toggle')}
          subtitle={cloudStatusText(cloud, t, i18n.language)}
          toggle={rt.cloudEnabled}
          onToggle={(v) => void rt.setCloudEnabled(v)}
          testID="icloud-toggle"
        />
        {cloud.status === 'unavailable' ? (
          <ListRow
            icon="settings-outline"
            title={t('cloud.openSettings')}
            onPress={() => void Linking.openSettings()}
          />
        ) : rt.cloudEnabled ? (
          <ListRow
            icon="sync-outline"
            title={t('cloud.syncNow')}
            onPress={() => void rt.syncNow()}
            chevron={false}
          />
        ) : null}
      </Group>
      <Group title={t('settings.backup')}>
        <ListRow
          icon="share-outline"
          title={t('settings.export')}
          subtitle={t('settings.exportBody')}
          onPress={() => void doExport()}
        />
        <ListRow
          icon="download-outline"
          title={t('settings.import')}
          subtitle={t('settings.importBody')}
          onPress={() => void doImport()}
        />
      </Group>
      <View style={{ gap: space.md }}>
        <Text variant="title3" color="danger">
          {t('settings.deleteAll')}
        </Text>
        <Text color="textMuted">
          {rt.cloudEnabled ? t('settings.deleteAllCloud') : t('settings.deleteAllBody')}
        </Text>
        <TextField
          label={t('settings.deleteTypeConfirm')}
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="characters"
          testID="delete-confirm"
        />
        <Button
          title={t('settings.deleteAll')}
          variant="danger"
          icon="trash-outline"
          loading={deleting}
          disabled={confirm.trim().toUpperCase() !== t('settings.deleteWord').toUpperCase()}
          onPress={del}
        />
      </View>
    </ScrollView>
  );
}
