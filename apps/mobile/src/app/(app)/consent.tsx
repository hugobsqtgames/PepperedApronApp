import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRepos } from '../../hooks/runtime';
import { initAds } from '../../services/ads';
import { space } from '../../theme/tokens';
import { Button, Text } from '../../ui';

/** Asked once. Refusing changes nothing in the app; both choices can be changed in Settings → Privacy. */
export default function Consent() {
  const { t } = useTranslation();
  const repos = useRepos();
  const choose = async (v: boolean) => {
    await repos.updateSettings({ analyticsConsent: v, onboardingDone: true });
    router.back();
    // Ad consent (IAB TCF / UMP) is collected by Google's certified form right after.
    setTimeout(() => void initAds(), 500);
  };
  return (
    <View style={{ padding: space.xxl, gap: space.lg }}>
      <Text style={{ fontSize: 40 }} maxFontSizeMultiplier={1}>
        🍪
      </Text>
      <Text variant="title2" accessibilityRole="header">
        {t('settings.analytics')}
      </Text>
      <Text color="textMuted">{t('settings.analyticsBody')}</Text>
      <Button title={t('common.confirm')} onPress={() => choose(true)} testID="consent-accept" />
      <Button title={t('common.skip')} variant="secondary" onPress={() => choose(false)} testID="consent-refuse" />
    </View>
  );
}
