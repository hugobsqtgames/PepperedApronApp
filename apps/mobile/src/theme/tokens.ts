/**
 * PepperedApron design tokens.
 * Five brand colours only — forest green (primary), paprika (accent), cream, sand, ink —
 * with a dedicated dark palette (not an inversion): deep green-black surfaces, warm off-white
 * text and a lighter sage green so the primary keeps AA contrast on dark backgrounds.
 */
export const palette = {
  forest: '#1F4D3A',
  forestDeep: '#163A2B',
  paprika: '#D2642A',
  cream: '#F7F1E6',
  sand: '#E8DFCF',
  ink: '#1F2A24',
  // dark
  night: '#121814',
  nightSurface: '#1A221D',
  nightRaised: '#232D27',
  nightLine: '#2E3A33',
  sage: '#86C1A2',
  paprikaLight: '#E8894F',
  parchment: '#F2ECE1',
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;
  line: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  /** Paprika for text: the brand paprika is too light for small text (WCAG AA 4.5:1). */
  accentText: string;
  danger: string;
  dangerSoft: string;
  success: string;
  overlay: string;
  shadow: string;
  skeleton: string;
  tabBar: string;
}

export const lightColors: ThemeColors = {
  background: palette.cream,
  surface: '#FFFCF6',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: '#F0E8DA',
  line: palette.sand,
  text: palette.ink,
  textMuted: '#5E655F',
  textSubtle: '#646962',
  primary: palette.forest,
  onPrimary: palette.cream,
  primarySoft: '#DDE8E1',
  accent: palette.paprika,
  onAccent: '#FFFFFF',
  accentSoft: '#F8E3D5',
  accentText: '#A84A1A',
  danger: '#A33A25',
  dangerSoft: '#F6DDD6',
  success: palette.forest,
  overlay: 'rgba(18, 24, 20, 0.45)',
  shadow: 'rgba(31, 42, 36, 0.12)',
  skeleton: '#EDE5D6',
  tabBar: 'rgba(255, 252, 246, 0.96)',
};

export const darkColors: ThemeColors = {
  background: palette.night,
  surface: palette.nightSurface,
  surfaceRaised: palette.nightRaised,
  surfaceMuted: '#1E2822',
  line: palette.nightLine,
  text: palette.parchment,
  textMuted: '#B3AC9F',
  textSubtle: '#958D81',
  primary: palette.sage,
  onPrimary: '#0E2218',
  primarySoft: '#1F3A2D',
  accent: palette.paprikaLight,
  onAccent: '#1D0F06',
  accentSoft: '#3A2518',
  accentText: palette.paprikaLight,
  danger: '#EC8B73',
  dangerSoft: '#3B211B',
  success: palette.sage,
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: 'rgba(0, 0, 0, 0.5)',
  skeleton: '#232D27',
  tabBar: 'rgba(26, 34, 29, 0.97)',
};

/**
 * Increase Contrast (iOS setting): darker text and lines, deeper accents, opaque bars. Every
 * text pair reaches WCAG AAA 7:1 (see __tests__/contrast.test.ts).
 */
export const lightContrastColors: ThemeColors = {
  ...lightColors,
  line: '#A89C86',
  textMuted: '#3A403B',
  textSubtle: '#3F4540',
  primary: '#123123',
  primarySoft: '#D5E3DA',
  accentText: '#7A3210',
  danger: '#7E2614',
  tabBar: '#FFFCF6',
  overlay: 'rgba(18, 24, 20, 0.7)',
};
export const darkContrastColors: ThemeColors = {
  ...darkColors,
  line: '#5B6B62',
  text: '#FFFFFF',
  textMuted: '#DED8CC',
  textSubtle: '#D2CBBF',
  primary: '#B5E2C9',
  primarySoft: '#173023',
  accentText: '#F7B98E',
  danger: '#F8B4A2',
  tabBar: palette.nightSurface,
  overlay: 'rgba(0, 0, 0, 0.8)',
};

/** Reduce Transparency (iOS setting): bars and overlays become opaque. */
export function opaque(c: ThemeColors): ThemeColors {
  const dark = c.background === darkColors.background;
  return { ...c, tabBar: c.surface, overlay: dark ? '#000000' : '#2B332E' };
}

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, xxl: 28, pill: 999 } as const;

export const fonts = {
  display: 'Fraunces_700Bold',
  displaySemi: 'Fraunces_600SemiBold',
} as const;

/** Type scale (points). Body text uses the system font so Dynamic Type & SF behave natively. */
export const type = {
  hero: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.5 },
  title1: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.3 },
  title2: { fontFamily: fonts.displaySemi, fontSize: 21, lineHeight: 27 },
  title3: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  callout: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 13, lineHeight: 18 },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.4 },
  cook: { fontSize: 30, lineHeight: 42, fontWeight: '500' },
} as const;

export type TypeVariant = keyof typeof type;

export const motion = { fast: 150, base: 220, slow: 320 } as const;
export const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 } as const;
/** Minimum touch target (Apple HIG 44pt). */
export const TOUCH = 44;
