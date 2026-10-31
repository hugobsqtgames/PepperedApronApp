import { useEffect, useRef } from 'react';
import { Animated, Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Button, Icon, Text, type IconName } from '../../ui';

const STEPS: { icon: IconName; key: 'step1' | 'step2' | 'step3' }[] = [
  { icon: 'logo-instagram', key: 'step1' },
  { icon: 'paper-plane-outline', key: 'step2' },
  { icon: 'checkmark-circle', key: 'step3' },
];

/** Instagram, else its website: the user tries a real share at once. */
export async function openInstagram() {
  try {
    await Linking.openURL('instagram://');
  } catch {
    await Linking.openURL('https://www.instagram.com/').catch(() => undefined);
  }
}

/**
 * "Import a recipe in 10 seconds": the three gestures of a share from Instagram, TikTok or
 * Safari, shown one after the other, then a real try in Instagram. Used on the first launch and
 * again from Help.
 */
export function ImportTutorial({ onDone }: { onDone: (tryIt: boolean) => void }) {
  const { t } = useTranslation();
  const { colors, a11y } = useTheme();
  const shown = useRef(STEPS.map(() => new Animated.Value(a11y.reduceMotion ? 1 : 0))).current;
  useEffect(() => {
    if (a11y.reduceMotion) return;
    Animated.stagger(
      450,
      shown.map((v) => Animated.timing(v, { toValue: 1, duration: 380, useNativeDriver: true })),
    ).start();
  }, [a11y.reduceMotion, shown]);
  return (
    <View style={{ gap: space.lg, width: '100%', maxWidth: 520 }}>
      <Text style={{ fontSize: 48, lineHeight: 58 }} maxFontSizeMultiplier={1}>
        ⚡️
      </Text>
      <Text variant="hero" accessibilityRole="header">
        {t('tutorial.title')}
      </Text>
      <Text variant="body" color="textMuted">
        {t('tutorial.body')}
      </Text>
      <View style={{ gap: space.md }}>
        {STEPS.map((s, i) => (
          <Animated.View
            key={s.key}
            style={{
              opacity: shown[i],
              transform: [
                { translateY: shown[i]!.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
              ],
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              padding: space.md,
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.line,
            }}
            accessible
            accessibilityLabel={`${i + 1}. ${t(`tutorial.${s.key}`)}`}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primarySoft,
              }}
            >
              <Icon name={s.icon} size={22} color="primary" />
            </View>
            <Text variant="callout" style={{ flex: 1 }}>
              <Text variant="callout" weight="700">
                {i + 1}.{' '}
              </Text>
              {t(`tutorial.${s.key}`)}
            </Text>
          </Animated.View>
        ))}
      </View>
      <Text variant="caption" color="textMuted">
        {t('tutorial.hint')}
      </Text>
      <Button
        title={t('tutorial.try')}
        icon="logo-instagram"
        size="lg"
        onPress={() => onDone(true)}
        testID="tutorial-try"
      />
      <Button
        title={t('tutorial.later')}
        variant="ghost"
        onPress={() => onDone(false)}
        testID="tutorial-later"
      />
    </View>
  );
}
