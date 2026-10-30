import { useEffect, useState } from 'react';
import { Alert, Image, Linking, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { emptyDraft } from '@pepperedapron/core';
import { openDraft } from '../../../features/recipe/openDraft';
import { prepareImport } from '../../../services/autoImport';
import { ocrSupported } from '../../../services/ocr';
import { pickImages, type PhotoSource } from '../../../services/photos';
import { radius, space } from '../../../theme/tokens';
import { Button, IconButton, LoadingState, Screen, Text, useToast } from '../../../ui';

const MAX_PHOTOS = 10;

/**
 * Photo import: one or several pictures of the same recipe (a carousel's screenshots, the pages
 * of a book). Their text is read on the device and put together; a picture without text becomes
 * the recipe photo.
 */
export default function ImportPhoto() {
  const { t } = useTranslation();
  const toast = useToast();
  const params = useLocalSearchParams<{ uri?: string }>();
  const [uris, setUris] = useState<string[]>(params.uri ? [params.uri] : []);
  const [ocr, setOcr] = useState(false);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    void ocrSupported().then(setOcr);
  }, []);

  const pick = async (source: PhotoSource) => {
    const r = await pickImages(source, MAX_PHOTOS - uris.length);
    if (!r) return;
    if ('denied' in r) {
      Alert.alert(
        source === 'camera' ? t('errors.cameraPermission') : t('errors.photoPermission'),
        undefined,
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('errors.openSettings'), onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    setUris((u) => [...u, ...r.uris].slice(0, MAX_PHOTOS));
  };

  const usePhoto = () => {
    openDraft(emptyDraft(), { notice: 'photo', localImageUri: uris[0] ?? null });
  };

  const read = async () => {
    if (!uris.length) return;
    setReading(true);
    try {
      const p = await prepareImport({ kind: 'photos', uris });
      if (p.notice === 'photo') {
        toast(t('import.noText'), { tone: 'info' });
        return;
      }
      openDraft(p.draft, { notice: p.notice, localImageUri: p.localImageUri });
    } catch {
      toast(t('import.ocrUnavailable'), { tone: 'error' });
    } finally {
      setReading(false);
    }
  };

  const full = uris.length >= MAX_PHOTOS;

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: space.md }}>
        <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
          {t('import.photoTitle')}
        </Text>
        <IconButton icon="close" label={t('common.close')} onPress={() => router.back()} />
      </View>
      <Text color="textMuted" style={{ marginTop: space.sm }}>
        {t('import.photoBody')}
      </Text>
      {reading ? (
        <LoadingState label={t('import.reading')} />
      ) : (
        <View style={{ gap: space.md, marginTop: space.xl }}>
          {uris.length === 1 ? (
            <Image
              source={{ uri: uris[0] }}
              style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.xl }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : uris.length > 1 ? (
            <ScrollView horizontal contentContainerStyle={{ gap: space.sm }}>
              {uris.map((u, i) => (
                <View key={u}>
                  <Image
                    source={{ uri: u }}
                    style={{ width: 150, height: 200, borderRadius: radius.lg }}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                    accessibilityLabel={t('import.photoN', { n: i + 1 })}
                  />
                  <View style={{ position: 'absolute', top: 6, right: 6 }}>
                    <IconButton
                      icon="close"
                      size={32}
                      variant="overlay"
                      label={t('common.remove')}
                      onPress={() => setUris((x) => x.filter((y) => y !== u))}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}
          {uris.length ? (
            <>
              {ocr ? (
                <Button
                  title={
                    uris.length > 1
                      ? t('import.readTexts', { count: uris.length })
                      : t('import.readText')
                  }
                  icon="scan-outline"
                  onPress={read}
                />
              ) : (
                <Text variant="caption" color="textMuted">
                  {t('import.ocrUnavailable')}
                </Text>
              )}
              {!full ? (
                <Button
                  title={t('import.addPhotos')}
                  icon="add"
                  variant="secondary"
                  onPress={() => pick('library')}
                />
              ) : null}
              {uris.length === 1 ? (
                <Button
                  title={t('import.usePhoto')}
                  icon="image-outline"
                  variant="ghost"
                  onPress={usePhoto}
                />
              ) : null}
              <Text variant="caption" color="textMuted">
                {t('import.severalPhotosTip')}
              </Text>
            </>
          ) : (
            <>
              <Button
                title={t('editor.takePhoto')}
                icon="camera-outline"
                onPress={() => pick('camera')}
              />
              <Button
                title={t('import.chooseLibraryMany')}
                icon="images-outline"
                variant="secondary"
                onPress={() => pick('library')}
              />
              <Button
                title={t('editor.chooseFile')}
                icon="folder-outline"
                variant="ghost"
                onPress={() => pick('files')}
              />
              <Text variant="caption" color="textMuted">
                {t('import.severalPhotosTip')}
              </Text>
            </>
          )}
        </View>
      )}
    </Screen>
  );
}
