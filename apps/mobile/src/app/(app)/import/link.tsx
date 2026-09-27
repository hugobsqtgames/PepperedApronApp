import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { emptyDraft } from '@pepperedapron/core';
import { NetworkError } from '@pepperedapron/client';
import { openDraft } from '../../../features/recipe/openDraft';
import { useRuntime } from '../../../hooks/runtime';
import { errorMessage } from '../../../lib/errors';
import { track } from '../../../services/analytics';
import { space } from '../../../theme/tokens';
import { Button, IconButton, LoadingState, Screen, Text, TextField } from '../../../ui';

export default function ImportLink() {
  const { t } = useTranslation();
  const rt = useRuntime();
  const params = useLocalSearchParams<{ url?: string }>();
  const [url, setUrl] = useState(params.url ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.url) void run(params.url);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (raw: string) => {
    const value = raw.trim().match(/https?:\/\/\S+/)?.[0];
    if (!value) return setError(t('errors.fetch_invalid_url'));
    setError(null);
    setLoading(true);
    track('import_url');
    try {
      const res = await rt.api.importUrl(value);
      openDraft(res.draft, { notice: res.completeness });
    } catch (e) {
      if (e instanceof NetworkError) {
        // Offline: keep the link as the source so nothing is lost; the user completes the rest.
        const d = emptyDraft();
        d.sourceUrl = value;
        d.source = new URL(value).hostname.replace(/^www\./, '');
        openDraft(d, { notice: 'minimal' });
      } else {
        setError(errorMessage(e, t));
      }
    } finally {
      setLoading(false);
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
        <LoadingState label={t('import.fetching')} />
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
              title={t('import.fetch')}
              onPress={() => run(url)}
              style={{ flex: 1 }}
              disabled={!url.trim()}
              testID="import-url-submit"
            />
          </View>
          <Text variant="caption" color="textMuted">
            {t('add.shareTip')}
          </Text>
        </View>
      )}
    </Screen>
  );
}
