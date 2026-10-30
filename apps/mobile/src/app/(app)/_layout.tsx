import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useShareIntentContext } from 'expo-share-intent';
import { useTranslation } from 'react-i18next';
import { useRuntime } from '../../hooks/runtime';
import { rescheduleReminders } from '../../services/notifications';
import { sourcesFromShare } from '../../services/autoImport';
import { importQueue } from '../../services/importQueue';
import { shouldShowWhatsNew } from '../../services/appMoments';
import { publishWidgetData } from '../../services/widgets';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Whatever is shared to PepperedApron (a TikTok or Instagram link, screenshots, a video, a text)
 * is imported and saved on its own; the import screen shows the progress.
 */
function useShareIntentRouting() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (!hasShareIntent) return;
    const files = shareIntent.files ?? [];
    const sources = sourcesFromShare({
      text: shareIntent.text ?? null,
      url: shareIntent.webUrl ?? null,
      title: (shareIntent.meta?.title as string | undefined) ?? null,
      images: files.filter((f) => f.mimeType?.startsWith('image/')).map((f) => f.path),
      videos: files.filter((f) => f.mimeType?.startsWith('video/')).map((f) => f.path),
      pdfs: files
        .filter((f) => f.mimeType === 'application/pdf' || /\.pdf$/i.test(f.path))
        .map((f) => f.path),
    });
    resetShareIntent();
    if (!sources.length) return;
    void importQueue
      .add(
        sources.map((source) => ({ source })),
        { batch: sources.length > 1 },
      )
      .then((ids) => router.push({ pathname: '/import/queue', params: { ids: ids.join(',') } }));
  }, [hasShareIntent, shareIntent, resetShareIntent]);
}

function useNotificationRouting() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = last?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
  }, [last]);
}

export default function AppLayout() {
  const rt = useRuntime();
  const { colors } = useTheme();
  const { t } = useTranslation();
  useShareIntentRouting();
  useNotificationRouting();

  // Imports interrupted when the app was closed resume on their own.
  useEffect(() => {
    if (rt.session) void importQueue.start();
  }, [rt.session]);

  // After an update: what changed, once.
  useEffect(() => {
    if (!rt.session) return;
    void shouldShowWhatsNew().then((show) => show && router.push('/whats-new'));
  }, [rt.session]);

  useEffect(() => {
    const s = rt.session;
    if (!s) return;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const refreshDerived = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        void rescheduleReminders(s.repos);
        void publishWidgetData(s.repos);
      }, 2000);
    };
    refreshDerived();
    const off1 = s.store.subscribe((changed) => {
      if (
        changed.has('mealPlanEntry') ||
        changed.has('settings') ||
        changed.has('shoppingItem') ||
        changed.has('recipe')
      )
        refreshDerived();
    });
    const off2 = rt.onRemoteChange(refreshDerived);
    return () => {
      off1();
      off2();
      if (pending) clearTimeout(pending);
    };
  }, [rt.session, rt]);

  const sheet = {
    presentation: 'formSheet' as const,
    sheetGrabberVisible: true,
    sheetCornerRadius: 28,
    contentStyle: { backgroundColor: colors.background },
  };
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTitleStyle: { color: colors.text },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add" options={{ ...sheet, sheetAllowedDetents: 'fitToContents' }} />
      <Stack.Screen name="recipe/[id]/index" />
      <Stack.Screen
        name="recipe/[id]/cook"
        options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }}
      />
      <Stack.Screen name="recipe/edit" options={{ presentation: 'modal', gestureEnabled: false }} />
      <Stack.Screen name="import/link" options={{ presentation: 'modal' }} />
      <Stack.Screen name="import/text" options={{ presentation: 'modal' }} />
      <Stack.Screen name="import/photo" options={{ presentation: 'modal' }} />
      <Stack.Screen name="import/queue" options={{ presentation: 'modal' }} />
      <Stack.Screen name="whats-new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="import/instagram" options={{ presentation: 'modal' }} />
      <Stack.Screen name="import/dictate" options={{ presentation: 'modal' }} />
      <Stack.Screen name="tools/converter" options={{ ...sheet, sheetAllowedDetents: [0.75, 1] }} />
      <Stack.Screen name="plan/templates" options={{ ...sheet, sheetAllowedDetents: [0.7, 1] }} />
      <Stack.Screen name="plan/pick" options={{ presentation: 'modal' }} />
      <Stack.Screen
        name="shopping/item/[id]"
        options={{ ...sheet, sheetAllowedDetents: [0.7, 1] }}
      />
      <Stack.Screen name="shopping/lists" options={{ ...sheet, sheetAllowedDetents: [0.6, 1] }} />
      <Stack.Screen name="collection/[id]" options={{ headerShown: true, title: '' }} />
      <Stack.Screen
        name="calendar"
        options={{ headerShown: true, title: t('planning.calendar') }}
      />
    </Stack>
  );
}
