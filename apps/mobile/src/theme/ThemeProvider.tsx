import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { ThemePreference } from '@pepperedapron/core';
import { darkColors, lightColors, type ThemeColors } from './tokens';

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  preference: ThemePreference;
}

const ThemeContext = createContext<Theme>({
  dark: false,
  colors: lightColors,
  preference: 'system',
});

export function ThemeProvider({
  preference,
  children,
}: {
  preference: ThemePreference;
  children: ReactNode;
}) {
  const system = useColorScheme();
  const dark = preference === 'dark' || (preference === 'system' && system === 'dark');
  const value = useMemo(
    () => ({ dark, colors: dark ? darkColors : lightColors, preference }),
    [dark, preference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
