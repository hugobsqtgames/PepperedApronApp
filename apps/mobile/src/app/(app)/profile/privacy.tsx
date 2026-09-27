import { Linking, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRepos, useRuntime, useSettings } from '../../../hooks/runtime';
import { adsEnabled, showPrivacyOptions } from '../../../services/ads';
import { space } from '../../../theme/tokens';
import { Group, ListRow } from '../../../ui';

export default function Privacy() {
  const { t } = useTranslation();
  const repos = useRepos();
  const rt = useRuntime();
  const s = useSettings();
  const legal = rt.config?.legal;
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
      <Group>
        <ListRow
          title={t('settings.analytics')}
          subtitle={t('settings.analyticsBody')}
          toggle={s.analyticsConsent === true}
          onToggle={(v) => void repos.updateSettings({ analyticsConsent: v })}
        />
        {adsEnabled() ? (
          <ListRow
            title={t('settings.ads')}
            subtitle={t('settings.adsBody')}
            onPress={() => void showPrivacyOptions()}
          />
        ) : null}
      </Group>
      {legal ? (
        <Group>
          <ListRow
            icon="document-text-outline"
            title={t('settings.privacyPolicy')}
            onPress={() => void Linking.openURL(legal.privacy)}
          />
          <ListRow
            icon="document-outline"
            title={t('settings.terms')}
            onPress={() => void Linking.openURL(legal.terms)}
          />
          <ListRow
            icon="business-outline"
            title={t('settings.legalNotice')}
            onPress={() => void Linking.openURL(legal.notice)}
          />
        </Group>
      ) : null}
    </ScrollView>
  );
}
