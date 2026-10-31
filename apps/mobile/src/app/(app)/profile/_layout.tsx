import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../theme/ThemeProvider';

export default function ProfileLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('profile.title'), headerLargeTitle: true }} />
      <Stack.Screen name="notifications" options={{ title: t('profile.notifications') }} />
      <Stack.Screen name="appearance" options={{ title: t('profile.appearance') }} />
      <Stack.Screen name="language" options={{ title: t('profile.language') }} />
      <Stack.Screen name="privacy" options={{ title: t('profile.privacy') }} />
      <Stack.Screen name="data" options={{ title: t('profile.data') }} />
      <Stack.Screen name="help" options={{ title: t('profile.help') }} />
      <Stack.Screen name="my-recipes" options={{ title: t('profile.myRecipes') }} />
      <Stack.Screen name="journal" options={{ title: t('delight.journal.title') }} />
      <Stack.Screen name="badges" options={{ title: t('delight.badges.title') }} />
      <Stack.Screen name="map" options={{ title: t('delight.map.title') }} />
      <Stack.Screen name="review" options={{ title: t('delight.review.kicker') }} />
    </Stack>
  );
}
