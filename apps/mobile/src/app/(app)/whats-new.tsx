import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { appVersion } from '../../services/appMoments';
import { space } from '../../theme/tokens';
import { Button, Icon, Screen, Text, type IconName } from '../../ui';

/** Shown once after an update: what changed, in a few lines. */
export default function WhatsNew() {
  const { t } = useTranslation();
  const items = t('whatsNew.items', { returnObjects: true }) as {
    icon: IconName;
    title: string;
    body: string;
  }[];
  return (
    <Screen edges={['top', 'bottom']} maxWidth={560}>
      <View style={{ gap: space.xl, paddingTop: space.xxl }}>
        <View style={{ gap: space.xs }}>
          <Text variant="hero" accessibilityRole="header">
            {t('whatsNew.title')}
          </Text>
          <Text variant="callout" color="textMuted">
            {t('whatsNew.version', { version: appVersion() })}
          </Text>
        </View>
        {items.map((it) => (
          <View key={it.title} style={{ flexDirection: 'row', gap: space.md }} accessible>
            <Icon name={it.icon} size={28} color="primary" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{it.title}</Text>
              <Text variant="callout" color="textMuted">
                {it.body}
              </Text>
            </View>
          </View>
        ))}
        <Button
          title={t('common.continue')}
          size="lg"
          onPress={() => router.back()}
          testID="whats-new-ok"
        />
      </View>
    </Screen>
  );
}
