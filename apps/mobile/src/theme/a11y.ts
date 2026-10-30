import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** iOS accessibility settings the app follows (Settings › Accessibility). */
export interface A11yPrefs {
  /** Reduce Motion: no sliding, springing or pulsing; fades at most. */
  reduceMotion: boolean;
  /** Reduce Transparency: opaque bars and overlays. */
  reduceTransparency: boolean;
  /** Bold Text: heavier weights, also for the custom Fraunces titles. */
  boldText: boolean;
  /** Increase Contrast: stronger text, lines and accents. */
  highContrast: boolean;
  /** VoiceOver is running: announcements are made for what changes on screen. */
  screenReader: boolean;
}

export const DEFAULT_A11Y: A11yPrefs = {
  reduceMotion: false,
  reduceTransparency: false,
  boldText: false,
  highContrast: false,
  screenReader: false,
};

const QUERIES: [keyof A11yPrefs, () => Promise<boolean>, string][] = [
  ['reduceMotion', () => AccessibilityInfo.isReduceMotionEnabled(), 'reduceMotionChanged'],
  [
    'reduceTransparency',
    () => AccessibilityInfo.isReduceTransparencyEnabled(),
    'reduceTransparencyChanged',
  ],
  ['boldText', () => AccessibilityInfo.isBoldTextEnabled(), 'boldTextChanged'],
  [
    'highContrast',
    () =>
      Platform.OS === 'ios'
        ? AccessibilityInfo.isDarkerSystemColorsEnabled()
        : AccessibilityInfo.isHighTextContrastEnabled(),
    Platform.OS === 'ios' ? 'darkerSystemColorsChanged' : 'highTextContrastChanged',
  ],
  ['screenReader', () => AccessibilityInfo.isScreenReaderEnabled(), 'screenReaderChanged'],
];

/** The current accessibility settings, updated live when the user changes them. */
export function useA11yPrefs(): A11yPrefs {
  const [prefs, setPrefs] = useState<A11yPrefs>(DEFAULT_A11Y);
  useEffect(() => {
    let alive = true;
    const subs = QUERIES.map(([key, query, event]) => {
      query()
        .then((v) => alive && setPrefs((p) => (p[key] === v ? p : { ...p, [key]: v })))
        .catch(() => undefined);
      return AccessibilityInfo.addEventListener(event as never, (v: boolean) =>
        setPrefs((p) => (p[key] === v ? p : { ...p, [key]: v })),
      );
    });
    return () => {
      alive = false;
      subs.forEach((s) => s.remove());
    };
  }, []);
  return prefs;
}

/** Heavier weight for Bold Text ("400" → "600", "600" → "700"…). */
export function bolder(w: string | number | undefined): '600' | '700' | '800' {
  const n = w === 'bold' ? 700 : Number(w ?? 400) || 400;
  return n >= 700 ? '800' : n >= 600 ? '700' : '600';
}
