import { darkColors, lightColors, type ThemeColors } from '../src/theme/tokens';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};

/** Text/background pairs actually used by the app; small text needs WCAG AA 4.5:1. */
const pairs: [keyof ThemeColors, keyof ThemeColors][] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['textMuted', 'background'],
  ['textMuted', 'surfaceMuted'],
  ['textSubtle', 'background'],
  ['textSubtle', 'surface'],
  ['primary', 'background'],
  ['primary', 'primarySoft'],
  ['accentText', 'background'],
  ['accentText', 'accentSoft'],
  ['accentText', 'surface'],
  ['danger', 'dangerSoft'],
  ['onPrimary', 'primary'],
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s theme contrast', (_name, c) => {
  it.each(pairs)('%s on %s ≥ 4.5:1', (fg, bg) => {
    expect(ratio(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
