import { Alert, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLive, useRuntime, useSyncStatus } from '../../../hooks/runtime';
import { ENV } from '../../../services/env';
import { useTheme } from '../../../theme/ThemeProvider';
import { space } from '../../../theme/tokens';
import { Group, ListRow, SyncIndicator, Text } from '../../../ui';

export default function Profile() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rt = useRuntime();
  const sync = useSyncStatus();
  const stats = useLive(['recipe', 'favorite', 'collection'], (r) => {
    const lib = r.library();
    return { recipes: lib.filter((x) => x.ownerId === rt.user?.id).length, favorites: r.favoriteRecipes().length, collections: r.collections().length, public: lib.filter((x) => x.ownerId === rt.user?.id && x.data.visibility === 'public').length };
  });
  const initial = (rt.user?.displayName ?? '?').trim().charAt(0).toUpperCase();

  const signOut = () =>
    Alert.alert(t('profile.signOutConfirm'), sync.pending ? t('profile.signOutPending') : undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signOut'), style: 'destructive', onPress: () => void rt.signOut() },
    ]);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.huge, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden>
          <Text variant="title1" style={{ color: colors.onPrimary }}>
            {initial}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="title2">{rt.user?.displayName}</Text>
          <Text variant="callout" color="textMuted" numberOfLines={1}>
            {rt.user?.email.endsWith('.invalid') ? '' : rt.user?.email}
          </Text>
        </View>
      </View>
      <SyncIndicator />
      <Group>
        <ListRow icon="book-outline" title={t('profile.myRecipes')} value={String(stats.recipes)} onPress={() => router.push('/profile/my-recipes')} />
        <ListRow icon="heart-outline" title={t('profile.myFavorites')} value={String(stats.favorites)} onPress={() => router.push('/favorites')} />
        <ListRow icon="albums-outline" title={t('profile.myCollections')} value={String(stats.collections)} onPress={() => router.push('/favorites')} />
        <ListRow icon="globe-outline" title={t('profile.myPublic')} value={String(stats.public)} onPress={() => router.push({ pathname: '/profile/my-recipes', params: { filter: 'public' } })} />
        <ListRow icon="people-circle-outline" title={t('profile.community')} onPress={() => router.push('/community')} />
        <ListRow icon="home-outline" title={t('profile.household')} value={rt.household?.name} onPress={() => router.push('/profile/household')} testID="open-household" />
      </Group>
      <Group title={t('profile.settings')}>
        <ListRow icon="person-outline" title={t('profile.account')} onPress={() => router.push('/profile/account')} />
        <ListRow icon="shield-checkmark-outline" title={t('profile.security')} onPress={() => router.push('/profile/security')} />
        <ListRow icon="notifications-outline" title={t('profile.notifications')} onPress={() => router.push('/profile/notifications')} />
        <ListRow icon="color-palette-outline" title={t('profile.appearance')} onPress={() => router.push('/profile/appearance')} />
        <ListRow icon="language-outline" title={`${t('profile.language')} · ${t('profile.units')}`} onPress={() => router.push('/profile/language')} />
        <ListRow icon="lock-closed-outline" title={t('profile.privacy')} onPress={() => router.push('/profile/privacy')} />
        <ListRow icon="download-outline" title={t('profile.data')} onPress={() => router.push('/profile/data')} />
        <ListRow icon="help-buoy-outline" title={`${t('profile.help')} · ${t('profile.contact')}`} onPress={() => router.push('/profile/help')} />
        {rt.user?.role === 'admin' ? <ListRow icon="construct-outline" title={t('profile.admin')} onPress={() => router.push('/admin')} /> : null}
      </Group>
      <Group>
        <ListRow icon="log-out-outline" title={t('profile.signOut')} danger onPress={signOut} testID="sign-out" />
      </Group>
      <Text variant="caption" color="textSubtle" align="center">
        PepperedApron · {t('profile.version', { version: ENV.appVersion })}
      </Text>
    </ScrollView>
  );
}
