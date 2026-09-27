import { ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LOCALES } from '@pepperedapron/core';
import { useRepos, useRuntime, useSettings } from '../../../hooks/runtime';
import { LANGUAGE_NAMES, setLanguage, deviceLocale } from '../../../i18n';
import { space } from '../../../theme/tokens';
import { Group, ListRow } from '../../../ui';

export default function Language() {
  const { t } = useTranslation();
  const repos = useRepos();
  const rt = useRuntime();
  const s = useSettings();
  const choose = async (l: (typeof LOCALES)[number] | null) => {
    await repos.updateSettings({ locale: l });
    setLanguage(l ?? deviceLocale());
    // The server uses the locale for e-mails and push notifications.
    void rt.api.updateMe({ locale: l ?? deviceLocale() }).catch(() => undefined);
  };
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.xl, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
      <Group title={t('profile.language')}>
        <ListRow title={t('settings.languageAuto')} icon={s.locale === null ? 'checkmark' : undefined} onPress={() => void choose(null)} chevron={false} />
        {LOCALES.map((l) => (
          <ListRow key={l} title={LANGUAGE_NAMES[l]} icon={s.locale === l ? 'checkmark' : undefined} onPress={() => void choose(l)} chevron={false} testID={`lang-${l}`} />
        ))}
      </Group>
      <Group title={t('profile.units')}>
        <ListRow title={t('settings.unitsMetric')} icon={s.unitSystem === 'metric' ? 'checkmark' : undefined} onPress={() => void repos.updateSettings({ unitSystem: 'metric' })} chevron={false} />
        <ListRow title={t('settings.unitsImperial')} icon={s.unitSystem === 'imperial' ? 'checkmark' : undefined} onPress={() => void repos.updateSettings({ unitSystem: 'imperial' })} chevron={false} />
      </Group>
    </ScrollView>
  );
}
