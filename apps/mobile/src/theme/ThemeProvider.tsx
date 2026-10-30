import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { ThemePreference } from '@pepperedapron/core';
import { tintFor, type RGB } from '../lib/tint';
import { DEFAULT_A11Y, useA11yPrefs, type A11yPrefs } from './a11y';
import {
  darkColors,
  darkContrastColors,
  lightColors,
  lightContrastColors,
  opaque,
  type ThemeColors,
} from './tokens';

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  preference: ThemePreference;
  /** iOS accessibility settings (Reduce Motion, Bold Text, Increase Contrast…). */
  a11y: A11yPrefs;
}

const ThemeContext = createContext<Theme>({
  dark: false,
  colors: lightColors,
  preference: 'system',
  a11y: DEFAULT_A11Y,
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
  const a11y = useA11yPrefs();
  const value = useMemo(() => {
    let colors = a11y.highContrast
      ? dark
        ? darkContrastColors
        : lightContrastColors
      : dark
        ? darkColors
        : lightColors;
    if (a11y.reduceTransparency) colors = opaque(colors);
    return { dark, colors, preference, a11y };
  }, [dark, preference, a11y]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/**
 * The screen takes on the colour of a dish (its photo): primary and accent colours in its hue,
 * with the same contrast guarantees. Not with Increase Contrast, where the app's AAA colours
 * stay.
 */
export function TintScope({ color, children }: { color: RGB | null; children: ReactNode }) {
  const parent = useTheme();
  const value = useMemo(() => {
    if (!color || parent.a11y.highContrast) return parent;
    return {
      ...parent,
      colors: { ...parent.colors, ...tintFor(color, parent.colors, parent.dark) },
    };
  }, [color, parent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
