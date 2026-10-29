import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { File } from 'expo-file-system';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { formatClock } from '@pepperedapron/core';
import { openDraft } from '../../../features/recipe/openDraft';
import { draftFromDictation } from '../../../services/autoImport';
import { haptic } from '../../../services/haptics';
import { transcribeFile } from '../../../services/importer';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import { Button, Icon, IconButton, LoadingState, Screen, Text, useToast } from '../../../ui';

/** Twenty minutes is more than enough to tell a recipe. */
const MAX_MS = 20 * 60_000;

/**
 * Say a recipe out loud: it is recorded, then written down by the iPhone's speech recognition
 * (on the device, nothing is sent), and opened in the editor to check.
 */
export default function Dictate() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const status = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'writing'>('idle');

  useEffect(
    () => () => {
      void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    },
    [],
  );

  const start = async () => {
    const p = await requestRecordingPermissionsAsync();
    if (!p.granted) {
      Alert.alert(t('dictate.micDenied'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('errors.openSettings'), onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record({ forDuration: MAX_MS / 1000 });
    haptic.light();
    setPhase('recording');
  };

  const stop = async () => {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    haptic.success();
    const uri = recorder.uri;
    if (!uri) return setPhase('idle');
    setPhase('writing');
    const heard = await transcribeFile(uri);
    try {
      new File(uri).delete();
    } catch {
      // Temporary file: the system cleans it anyway.
    }
    if ('error' in heard) {
      setPhase('idle');
      toast(
        heard.error === 'permission'
          ? t('import.listenPermission')
          : heard.error === 'language'
            ? t('import.listenLanguage')
            : heard.error === 'noAudio'
              ? t('dictate.nothingHeard')
              : t('dictate.failed'),
        { tone: 'error' },
      );
      return;
    }
    openDraft(draftFromDictation(heard.lines), { notice: 'dictation' });
  };

  const recording = phase === 'recording';

  return (
    <Screen edges={['top', 'bottom']} maxWidth={560} scroll={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: space.md }}>
        <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
          {t('dictate.title')}
        </Text>
        <IconButton
          icon="close"
          label={t('common.close')}
          onPress={() => {
            if (recording) void recorder.stop();
            router.back();
          }}
        />
      </View>
      {phase === 'writing' ? (
        <LoadingState label={t('dictate.writing')} />
      ) : (
        <View style={{ flex: 1, gap: space.xl, paddingTop: space.xl }}>
          <View style={[styles.tips, { backgroundColor: colors.surfaceMuted }]}>
            <Text variant="bodyStrong">{t('dictate.howTitle')}</Text>
            <Text variant="callout">{t('dictate.how1')}</Text>
            <Text variant="callout">{t('dictate.how2')}</Text>
            <Text variant="callout">{t('dictate.how3')}</Text>
            <Text variant="caption" color="textMuted">
              {t('dictate.private')}
            </Text>
          </View>
          <View style={{ alignItems: 'center', gap: space.lg, marginTop: 'auto' }}>
            <Text
              variant="hero"
              style={{ fontVariant: ['tabular-nums'] }}
              accessibilityLabel={t('dictate.duration')}
            >
              {formatClock(Math.round((status.durationMillis ?? 0) / 1000))}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={recording ? t('dictate.stop') : t('dictate.start')}
              onPress={() => void (recording ? stop() : start())}
              style={({ pressed }) => [
                styles.mic,
                {
                  backgroundColor: recording ? colors.danger : colors.accent,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              testID="dictate-mic"
            >
              <Icon name={recording ? 'stop' : 'mic'} size={44} tint="#FFFFFF" />
            </Pressable>
            <Text variant="callout" color="textMuted" align="center">
              {recording ? t('dictate.listeningHint') : t('dictate.startHint')}
            </Text>
            {recording ? (
              <Button title={t('dictate.done')} icon="checkmark" onPress={stop} />
            ) : null}
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tips: { gap: space.sm, padding: space.lg, borderRadius: radius.xl },
  mic: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
