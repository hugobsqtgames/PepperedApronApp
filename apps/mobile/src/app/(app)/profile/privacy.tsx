import { ScrollView, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { adsEnabled, showPrivacyOptions } from '../../../services/ads';
import { sitePage } from '../../../services/env';
import { CLOUD_SUPPORTED } from '../../../services/runtime';
import { space } from '../../../theme/tokens';
import { Card, Group, ListRow, Text } from '../../../ui';

export default function Privacy() {
  const { t, i18n } = useTranslation();
  const open = (page: 'privacy' | 'terms' | 'legal') =>
    void WebBrowser.openBrowserAsync(sitePage(page, i18n.language));
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: space.lg,
        gap: space.xl,
        maxWidth: 640,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      <Card>
        <View style={{ gap: space.sm }}>
          <Text variant="bodyStrong">{t('settings.privacyTitle')}</Text>
          <Text color="textMuted">
            {CLOUD_SUPPORTED ? t('settings.privacyBody') : t('settings.privacyBodyAndroid')}
          </Text>
        </View>
      </Card>
      {adsEnabled() ? (
        <Group>
          <ListRow
            icon="megaphone-outline"
            title={t('settings.ads')}
            subtitle={t('settings.adsBody')}
            onPress={() => void showPrivacyOptions()}
          />
        </Group>
      ) : null}
      <Group>
        <ListRow
          icon="document-text-outline"
          title={t('settings.privacyPolicy')}
          onPress={() => open('privacy')}
        />
        <ListRow
          icon="document-outline"
          title={t('settings.terms')}
          onPress={() => open('terms')}
        />
        <ListRow
          icon="business-outline"
          title={t('settings.legalNotice')}
          onPress={() => open('legal')}
        />
      </Group>
    </ScrollView>
  );
}
