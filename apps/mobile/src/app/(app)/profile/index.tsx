import { Image, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { cloudStatusIcon, cloudStatusText } from '../../../features/CloudStatus';
import { badgesOf } from '../../../features/kitchen';
import { useCloudStatus, useLive, useRepos, useSettings } from '../../../hooks/runtime';
import { ENV } from '../../../services/env';
import { useTheme } from '../../../theme/ThemeProvider';
import { space } from '../../../theme/tokens';
import { Group, ListRow, Text, usePrompt } from '../../../ui';
import { inBackground } from '../../../lib/errors';

/** Settings. No account: everything lives on this device (and in the user's own iCloud). */
export default function Settings() {
  const { t, i18n } = useTranslation();
  const { dark } = useTheme();
  const cloud = useCloudStatus();
  const repos = useRepos();
  const settings = useSettings();
  const prompt = usePrompt();
  const editName = () =>
    prompt({
      title: t('profile.firstName'),
      initial: settings.firstName ?? '',
      placeholder: t('onboarding.namePlaceholder'),
      maxLength: 40,
      onSubmit: (v) => inBackground(repos.updateSettings({ firstName: v })),
    });
  const stats = useLive(['recipe', 'favorite', 'collection'], (r) => ({
    recipes: r.recipes().length,
    favorites: r.favoriteRecipes().length,
    collections: r.collections().length,
  }));
  const kitchen = useLive(['cookLog', 'recipe'], (r) => {
    const b = badgesOf(r);
    return {
      cooks: r.allCookLogs().length,
      won: b.filter((x) => x.wonOn).length,
      badges: b.length,
    };
  });

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: space.lg,
        gap: space.xl,
        paddingBottom: space.huge,
        maxWidth: 720,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      <Group>
        <ListRow
          icon="person-outline"
          title={t('profile.firstName')}
          value={settings.firstName ?? t('profile.firstNameEmpty')}
          onPress={editName}
          testID="edit-first-name"
        />
      </Group>
      <Group>
        <ListRow
          icon={cloudStatusIcon(cloud)}
          title={t('cloud.title')}
          subtitle={cloudStatusText(cloud, t, i18n.language)}
          onPress={() => router.push('/profile/data')}
          testID="open-data"
        />
      </Group>
      <Group>
        <ListRow
          icon="book-outline"
          title={t('profile.myRecipes')}
          value={String(stats.recipes)}
          onPress={() => router.push('/profile/my-recipes')}
        />
        <ListRow
          icon="heart-outline"
          title={t('profile.myFavorites')}
          value={String(stats.favorites)}
          onPress={() => router.push('/favorites')}
        />
        <ListRow
          icon="albums-outline"
          title={t('profile.myCollections')}
          value={String(stats.collections)}
          onPress={() => router.push('/favorites')}
        />
        <ListRow
          icon="file-tray-stacked-outline"
          title={t('pantry.title')}
          onPress={() => router.push('/pantry')}
          testID="open-pantry"
        />
      </Group>
      <Group title={t('delight.journal.kicker')}>
        <ListRow
          icon="images-outline"
          title={t('delight.journal.title')}
          value={String(kitchen.cooks)}
          onPress={() => router.push('/profile/journal')}
          testID="open-journal"
        />
        <ListRow
          icon="ribbon-outline"
          title={t('delight.badges.title')}
          value={t('delight.badges.count', { won: kitchen.won, total: kitchen.badges })}
          onPress={() => router.push('/profile/badges')}
          testID="open-badges"
        />
        <ListRow
          icon="earth-outline"
          title={t('delight.map.title')}
          onPress={() => router.push('/profile/map')}
          testID="open-map"
        />
        <ListRow
          icon="sparkles-outline"
          title={t('delight.review.open', { year: new Date().getFullYear() })}
          onPress={() => router.push('/profile/review')}
          testID="open-review"
        />
      </Group>
      <Group title={t('profile.settings')}>
        <ListRow
          icon="notifications-outline"
          title={t('profile.notifications')}
          onPress={() => router.push('/profile/notifications')}
        />
        <ListRow
          icon="color-palette-outline"
          title={t('profile.appearance')}
          onPress={() => router.push('/profile/appearance')}
        />
        <ListRow
          icon="language-outline"
          title={`${t('profile.language')} · ${t('profile.units')}`}
          onPress={() => router.push('/profile/language')}
        />
        <ListRow
          icon="lock-closed-outline"
          title={t('profile.privacy')}
          onPress={() => router.push('/profile/privacy')}
        />
        <ListRow
          icon="folder-open-outline"
          title={t('profile.data')}
          onPress={() => router.push('/profile/data')}
        />
        <ListRow
          icon="help-buoy-outline"
          title={`${t('profile.help')} · ${t('profile.contact')}`}
          onPress={() => router.push('/profile/help')}
        />
      </Group>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Image
          source={
            dark
              ? require('../../../../assets/brand/mark-dark.png')
              : require('../../../../assets/brand/mark.png')
          }
          style={{ width: 40, height: 40 }}
          accessibilityIgnoresInvertColors
          accessibilityElementsHidden
        />
        <Text variant="caption" color="textSubtle" align="center">
          PepperedApron · {t('profile.version', { version: ENV.appVersion })}
        </Text>
      </View>
    </ScrollView>
  );
}
