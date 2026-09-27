import { useEffect, useState } from 'react';
import { Alert, Image, Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { emptyDraft } from '@pepperedapron/core';
import { openDraft, openTextDraft } from '../../../features/recipe/openDraft';
import { track } from '../../../services/analytics';
import { ocrSupported, readTextFromImage } from '../../../services/ocr';
import { pickImage, type PhotoSource } from '../../../services/photos';
import { radius, space } from '../../../theme/tokens';
import { Button, IconButton, LoadingState, Screen, Text, useToast } from '../../../ui';

/** Photo import: use the image as the recipe photo, or read the text of a printed recipe on-device. */
export default function ImportPhoto() {
  const { t } = useTranslation();
  const toast = useToast();
  const params = useLocalSearchParams<{ uri?: string }>();
  const [uri, setUri] = useState<string | null>(params.uri ?? null);
  const [ocr, setOcr] = useState(false);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    void ocrSupported().then(setOcr);
  }, []);

  const pick = async (source: PhotoSource) => {
    const r = await pickImage(source);
    if (!r) return;
    if ('denied' in r) {
      Alert.alert(source === 'camera' ? t('errors.cameraPermission') : t('errors.photoPermission'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('errors.openSettings'), onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    setUri(r.uri);
  };

  const usePhoto = () => {
    track('import_image', { ocr: false });
    openDraft(emptyDraft(), { notice: 'photo', localImageUri: uri });
  };

  const read = async () => {
    if (!uri) return;
    setReading(true);
    try {
      const text = await readTextFromImage(uri);
      if (!text) {
        toast(t('import.noText'), { tone: 'info' });
        return;
      }
      track('import_image', { ocr: true });
      openTextDraft(text, {}, 'text', uri);
    } catch {
      toast(t('import.ocrUnavailable'), { tone: 'error' });
    } finally {
      setReading(false);
    }
  };

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
          {uri ? <Image source={{ uri }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.xl }} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
          {!uri ? (
            <>
              <Button title={t('editor.takePhoto')} icon="camera-outline" onPress={() => pick('camera')} />
              <Button title={t('editor.chooseLibrary')} icon="images-outline" variant="secondary" onPress={() => pick('library')} />
              <Button title={t('editor.chooseFile')} icon="folder-outline" variant="ghost" onPress={() => pick('files')} />
            </>
          ) : (
            <>
              {ocr ? <Button title={t('import.readText')} icon="scan-outline" onPress={read} /> : <Text variant="caption" color="textMuted">{t('import.ocrUnavailable')}</Text>}
              <Button title={t('import.usePhoto')} icon="image-outline" variant="secondary" onPress={usePhoto} />
              <Button title={t('editor.changePhoto')} variant="ghost" onPress={() => setUri(null)} />
            </>
          )}
        </View>
      )}
    </Screen>
  );
}
