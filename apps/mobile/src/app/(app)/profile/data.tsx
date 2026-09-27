import { useState } from 'react';
import { Alert, ScrollView, Share, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import { useRuntime } from '../../../hooks/runtime';
import { errorMessage } from '../../../lib/errors';
import { space } from '../../../theme/tokens';
import { Button, Group, ListRow, Text, TextField, useToast } from '../../../ui';

/** RGPD: export everything as JSON, or delete the account for good. */
export default function DataScreen() {
  const { t } = useTranslation();
  const rt = useRuntime();
  const toast = useToast();
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const exportData = async () => {
    try {
      const data = await rt.api.exportData();
      const f = new File(
        Paths.cache,
        `pepperedapron-export-${new Date().toISOString().slice(0, 10)}.json`,
      );
      f.write(JSON.stringify(data, null, 2));
      await Share.share({ url: f.uri, title: 'PepperedApron export' });
      toast(t('settings.exportDone'));
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  const del = () =>
    Alert.alert(t('settings.deleteAccount'), t('settings.deleteAccountBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await rt.api.deleteAccount(rt.user?.hasPassword ? password : null);
            await rt.wipeAfterDeletion();
          } catch (e) {
            toast(errorMessage(e, t), { tone: 'error' });
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);

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
      <Group>
        <ListRow
          icon="download-outline"
          title={t('settings.export')}
          subtitle={t('settings.exportBody')}
          onPress={() => void exportData()}
        />
      </Group>
      <View style={{ gap: space.md }}>
        <Text variant="title3" color="danger">
          {t('settings.deleteAccount')}
        </Text>
        <Text color="textMuted">{t('settings.deleteAccountBody')}</Text>
        {rt.user?.hasPassword ? (
          <TextField
            label={t('settings.passwordToConfirm')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        ) : null}
        <TextField
          label={t('settings.deleteTypeConfirm')}
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="characters"
          testID="delete-confirm"
        />
        <Button
          title={t('settings.deleteAccount')}
          variant="danger"
          icon="trash-outline"
          loading={deleting}
          disabled={
            confirm.trim().toUpperCase() !== t('settings.deleteWord').toUpperCase() ||
            (rt.user?.hasPassword === true && !password)
          }
          onPress={del}
        />
      </View>
    </ScrollView>
  );
}
