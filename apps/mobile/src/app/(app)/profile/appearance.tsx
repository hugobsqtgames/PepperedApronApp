import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRepos, useSettings } from '../../../hooks/runtime';
import { space } from '../../../theme/tokens';
import { Group, ListRow, Segmented, Stepper, Text } from '../../../ui';

export default function Appearance() {
  const { t } = useTranslation();
  const repos = useRepos();
  const s = useSettings();
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
      <View style={{ gap: space.sm }}>
        <Text variant="caption" color="textMuted" weight="600">
          {t('settings.theme')}
        </Text>
        <Segmented
          value={s.theme}
          onChange={(theme) => void repos.updateSettings({ theme })}
          options={[
            { value: 'light', label: t('settings.themeLight') },
            { value: 'dark', label: t('settings.themeDark') },
            { value: 'system', label: t('settings.themeSystem') },
          ]}
        />
      </View>
      <Group>
        <ListRow
          title={t('settings.haptics')}
          subtitle={t('settings.hapticsBody')}
          toggle={s.hapticsEnabled}
          onToggle={(v) => void repos.updateSettings({ hapticsEnabled: v })}
        />
        <ListRow
          title={t('settings.defaultServings')}
          chevron={false}
          right={
            <Stepper
              value={s.defaultServings}
              onChange={(v) => void repos.updateSettings({ defaultServings: v })}
              label={t('settings.defaultServings')}
            />
          }
        />
      </Group>
    </ScrollView>
  );
}
