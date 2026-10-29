import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { strFromU8, unzipSync } from 'fflate';
import { instagramSavedPosts, type SavedPost } from '@pepperedapron/core';
import { importQueue } from '../../../services/importQueue';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import { Button, Icon, IconButton, LoadingState, Screen, Text, useToast } from '../../../ui';

/** Instagram exports can contain every photo of the account: read only the "saved" lists. */
const MAX_BYTES = 150 * 1024 * 1024;
const WANTED = /(^|\/)saved[^/]*\.(json|html?)$/i;

async function readExport(uri: string, name: string): Promise<{ name: string; text: string }[]> {
  const file = new File(uri);
  if (file.size > MAX_BYTES) throw new Error('too_big');
  const bytes = await file.bytes();
  if (/\.zip$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    const entries = unzipSync(bytes, { filter: (f) => WANTED.test(f.name) });
    return Object.entries(entries).map(([n, data]) => ({ name: n, text: strFromU8(data) }));
  }
  return [{ name, text: strFromU8(bytes) }];
}

function Step({ n, text }: { n: number; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
      <View style={[styles.num, { backgroundColor: colors.primarySoft }]}>
        <Text variant="bodyStrong" color="primary">
          {n}
        </Text>
      </View>
      <Text variant="body" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Bring the recipes saved on Instagram into the app: either all at once from the file Instagram
 * gives on request ("Download your information"), or one by one with the Share button.
 */
export default function InstagramImport() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();
  const [reading, setReading] = useState(false);
  const [found, setFound] = useState<SavedPost[] | null>(null);

  const choose = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/json', 'text/html', 'public.zip-archive', '*/*'],
      copyToCacheDirectory: true,
    });
    const asset = r.canceled ? null : r.assets[0];
    if (!asset) return;
    setReading(true);
    try {
      const posts = instagramSavedPosts(await readExport(asset.uri, asset.name));
      if (!posts.length) toast(t('instagram.noneFound'), { tone: 'error' });
      setFound(posts.length ? posts : null);
    } catch (e) {
      toast(
        (e as Error).message === 'too_big' ? t('instagram.tooBig') : t('instagram.unreadable'),
        { tone: 'error' },
      );
    } finally {
      setReading(false);
    }
  };

  const importAll = async () => {
    if (!found) return;
    await importQueue.add(
      found.map((p) => ({
        source: { kind: 'link' as const, url: p.url, text: null, title: null },
        collection: p.collection,
      })),
      { batch: true },
    );
    router.replace('/import/queue');
  };

  const collections = found ? new Set(found.map((p) => p.collection).filter(Boolean)).size : 0;

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: space.md }}>
        <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
          {t('instagram.title')}
        </Text>
        <IconButton icon="close" label={t('common.close')} onPress={() => router.back()} />
      </View>
      <Text color="textMuted" style={{ marginTop: space.sm }}>
        {t('instagram.intro')}
      </Text>

      {reading ? (
        <LoadingState label={t('instagram.reading')} />
      ) : found ? (
        <View style={[styles.card, { backgroundColor: colors.primarySoft, marginTop: space.xl }]}>
          <Icon name="checkmark-circle" size={28} color="primary" />
          <Text variant="title3">{t('instagram.found', { count: found.length })}</Text>
          {collections ? (
            <Text variant="callout" color="textMuted">
              {t('instagram.collections', { count: collections })}
            </Text>
          ) : null}
          <Text variant="callout" color="textMuted">
            {t('instagram.paceHint')}
          </Text>
          <Button
            title={t('instagram.importAll', { count: found.length })}
            icon="download-outline"
            onPress={importAll}
            testID="instagram-import-all"
          />
          <Button title={t('common.cancel')} variant="ghost" onPress={() => setFound(null)} />
        </View>
      ) : (
        <View style={{ gap: space.xxl, marginTop: space.xl }}>
          <View style={{ gap: space.md }}>
            <Text variant="title2" accessibilityRole="header">
              {t('instagram.allTitle')}
            </Text>
            <Step n={1} text={t('instagram.step1')} />
            <Step n={2} text={t('instagram.step2')} />
            <Step n={3} text={t('instagram.step3')} />
            <Step n={4} text={t('instagram.step4')} />
            <Button
              title={t('instagram.chooseFile')}
              icon="folder-open-outline"
              onPress={choose}
              testID="instagram-choose"
            />
          </View>

          <View style={{ gap: space.md }}>
            <Text variant="title2" accessibilityRole="header">
              {t('instagram.oneTitle')}
            </Text>
            <Step n={1} text={t('instagram.one1')} />
            <Step n={2} text={t('instagram.one2')} />
            <Step n={3} text={t('instagram.one3')} />
            <Button
              title={t('instagram.open')}
              icon="logo-instagram"
              variant="secondary"
              onPress={() =>
                void Linking.openURL('instagram://').catch(() =>
                  Linking.openURL('https://www.instagram.com/'),
                )
              }
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  num: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  card: { gap: space.md, padding: space.xl, borderRadius: radius.xl },
});
