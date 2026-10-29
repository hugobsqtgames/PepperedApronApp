import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { extractUrls, ImportUrlError } from '@pepperedapron/core';
import { linkNotice, openDraft } from '../../../features/recipe/openDraft';
import { errorMessage } from '../../../lib/errors';
import { importLinkFull } from '../../../services/importer';
import { importQueue } from '../../../services/importQueue';
import { space } from '../../../theme/tokens';
import { Button, IconButton, LoadingState, Screen, Text, TextField } from '../../../ui';

export default function ImportLink() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ url?: string }>();
  const [url, setUrl] = useState(params.url ?? '');
  const [loading, setLoading] = useState<'fetching' | 'listening' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.url) void run(params.url);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const urls = extractUrls(url);
  /** Several links pasted at once: they are imported one after the other and saved. */
  const runAll = async () => {
    await importQueue.add(
      urls.map((u) => ({ source: { kind: 'link' as const, url: u, text: null, title: null } })),
      { batch: true },
    );
    router.replace('/import/queue');
  };

  const run = async (raw: string) => {
    if (extractUrls(raw).length > 1) return runAll();
    setError(null);
    setLoading('fetching');
    try {
      // Offline or unreadable pages still open a draft keeping the link: nothing is lost.
      const { result, listenError } = await importLinkFull(raw, () => setLoading('listening'));
      openDraft(result.draft, { notice: linkNotice(result, listenError) });
    } catch (e) {
      setError(e instanceof ImportUrlError ? t('errors.invalid_url') : errorMessage(e, t));
    } finally {
      setLoading(null);
    }
  };

  return (
    <Screen edges={['top', 'bottom']} keyboard maxWidth={560}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: space.md }}>
        <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
          {t('import.linkTitle')}
        </Text>
        <IconButton icon="close" label={t('common.close')} onPress={() => router.back()} />
      </View>
      {loading ? (
        <LoadingState
          label={loading === 'listening' ? t('import.listening') : t('import.fetching')}
        />
      ) : (
        <View style={{ gap: space.lg, marginTop: space.xl }}>
          <TextField
            icon="link-outline"
            placeholder={t('import.linkPlaceholder')}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            multiline={urls.length > 1}
            returnKeyType="go"
            onSubmitEditing={() => void run(url)}
            error={error}
            autoFocus
            testID="import-url"
          />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              title={t('import.paste')}
              icon="clipboard-outline"
              variant="secondary"
              onPress={async () => setUrl(await Clipboard.getStringAsync())}
              style={{ flex: 1 }}
            />
            <Button
              title={
                urls.length > 1 ? t('import.fetchAll', { count: urls.length }) : t('import.fetch')
              }
              onPress={() => run(url)}
              style={{ flex: 1 }}
              disabled={!url.trim()}
              testID="import-url-submit"
            />
          </View>
          <Text variant="caption" color="textMuted">
            {t('add.shareTip')}
          </Text>
          <Text variant="caption" color="textMuted">
            {t('import.severalLinksTip')}
          </Text>
        </View>
      )}
    </Screen>
  );
}
