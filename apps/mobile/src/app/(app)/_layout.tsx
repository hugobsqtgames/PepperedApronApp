import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useShareIntentContext } from 'expo-share-intent';
import { useTranslation } from 'react-i18next';
import { useRuntime } from '../../hooks/runtime';
import { initAds } from '../../services/ads';
import { track } from '../../services/analytics';
import { registerPushToken, rescheduleReminders } from '../../services/notifications';
import { shareInbox } from '../../services/shareInbox';
import { publishWidgetData } from '../../services/widgets';
import { useTheme } from '../../theme/ThemeProvider';

/** Routes to the import screen whenever something is shared to PepperedApron. */
function useShareIntentRouting() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (!hasShareIntent) return;
    const image = shareIntent.files?.find((f) => f.mimeType?.startsWith('image/'));
    shareInbox.put({
      text: shareIntent.text ?? null,
      url: shareIntent.webUrl ?? null,
      imageUri: image?.path ?? null,
      title: (shareIntent.meta?.title as string | undefined) ?? null,
      receivedAt: Date.now(),
    });
    resetShareIntent();
    router.push('/import/shared');
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

  useEffect(() => {
    const s = rt.session;
    if (!s) return;
    track('app_open');
    // Consent is asked once, after onboarding, before any analytics or ad request.
    if (s.repos.settings().analyticsConsent === null)
      setTimeout(() => router.push('/consent'), 400);
    else void initAds();
    void registerPushToken();
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
    const off2 = rt.onAfterSync(refreshDerived);
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
      <Stack.Screen name="import/shared" options={{ presentation: 'modal' }} />
      <Stack.Screen name="plan/pick" options={{ presentation: 'modal' }} />
      <Stack.Screen
        name="shopping/item/[id]"
        options={{ ...sheet, sheetAllowedDetents: [0.7, 1] }}
      />
      <Stack.Screen name="shopping/lists" options={{ ...sheet, sheetAllowedDetents: [0.6, 1] }} />
      <Stack.Screen
        name="consent"
        options={{ ...sheet, sheetAllowedDetents: 'fitToContents', gestureEnabled: false }}
      />
      <Stack.Screen name="collection/[id]" options={{ headerShown: true, title: '' }} />
      <Stack.Screen
        name="calendar"
        options={{ headerShown: true, title: t('planning.calendar') }}
      />
    </Stack>
  );
}
