import '../i18n';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ShareIntentProvider } from 'expo-share-intent';
import { resolveLocale, setLanguage } from '../i18n';
import { useRuntime } from '../hooks/runtime';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';
import { ActionSheetProvider, ToastProvider } from '../ui';
import type { SettingsData } from '@pepperedapron/core';

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 250, fade: true });

function useUserSettings(): SettingsData | null {
  const rt = useRuntime();
  const [s, setS] = useState<SettingsData | null>(() => rt.session?.repos.settings() ?? null);
  useEffect(() => {
    const session = rt.session;
    if (!session) {
      setS(null);
      return;
    }
    setS(session.repos.settings());
    return session.store.subscribe((changed) => {
      if (changed.has('settings')) setS(session.repos.settings());
    });
  }, [rt.session]);
  return s;
}

function Navigator() {
  const rt = useRuntime();
  const { colors, dark } = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={rt.status === 'signedOut'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={rt.status === 'ready'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Screen name="reset-password" options={{ presentation: 'modal' }} />
        <Stack.Screen name="verify-email" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const rt = useRuntime();
  const settings = useUserSettings();
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold: require('../../assets/fonts/Fraunces_600SemiBold.ttf'),
    Fraunces_700Bold: require('../../assets/fonts/Fraunces_700Bold.ttf'),
  });

  useEffect(() => {
    void rt.boot().catch(() => undefined);
  }, [rt]);

  useEffect(() => {
    setLanguage(resolveLocale(settings?.locale));
  }, [settings?.locale]);

  const ready = fontsLoaded && rt.status !== 'booting';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <ShareIntentProvider options={{ resetOnBackground: false }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider preference={settings?.theme ?? 'system'}>
            <ToastProvider>
              <ActionSheetProvider>
                <Navigator />
              </ActionSheetProvider>
            </ToastProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}
