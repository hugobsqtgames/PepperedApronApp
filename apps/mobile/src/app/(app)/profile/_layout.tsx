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
      <Stack.Screen name="account" options={{ title: t('profile.account') }} />
      <Stack.Screen name="security" options={{ title: t('profile.security') }} />
      <Stack.Screen name="notifications" options={{ title: t('profile.notifications') }} />
      <Stack.Screen name="appearance" options={{ title: t('profile.appearance') }} />
      <Stack.Screen name="language" options={{ title: t('profile.language') }} />
      <Stack.Screen name="privacy" options={{ title: t('profile.privacy') }} />
      <Stack.Screen name="data" options={{ title: t('profile.data') }} />
      <Stack.Screen name="help" options={{ title: t('profile.help') }} />
      <Stack.Screen name="household" options={{ title: t('household.title') }} />
      <Stack.Screen name="my-recipes" options={{ title: t('profile.myRecipes') }} />
    </Stack>
  );
}
