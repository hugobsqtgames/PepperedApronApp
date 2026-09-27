import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRuntime } from '../../../hooks/runtime';
import { useTheme } from '../../../theme/ThemeProvider';

/** Only visible to admins (the API enforces it independently). */
export default function AdminLayout() {
  const rt = useRuntime();
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (rt.user?.role !== 'admin') return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="index" options={{ title: t('admin.title') }} />
      <Stack.Screen name="reports" options={{ title: t('admin.reports') }} />
      <Stack.Screen name="messages" options={{ title: t('admin.messages') }} />
    </Stack>
  );
}
