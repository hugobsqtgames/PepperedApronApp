import { darkColors, lightColors } from '../src/theme/tokens';
import { CATEGORY_TINTS, contrast, dominantColor, hslToRgb, rgbToHsl, tintFor, type RGB } from '../src/lib/tint';

describe('dish colour', () => {
  it('keeps every text and button readable (AA 4.5:1) for any dish colour, light and dark', () => {
    let checked = 0;
    for (let h = 0; h < 1; h += 1 / 36)
      for (const s of [0.05, 0.3, 0.6, 1])
        for (const l of [0.1, 0.3, 0.5, 0.7, 0.9]) {
          const color = hslToRgb(h, s, l);
          for (const [base, dark] of [
            [lightColors, false],
            [darkColors, true],
          ] as const) {
            const t = tintFor(color, base, dark);
            expect(contrast(t.primary, base.background)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(t.primary, base.surface)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(t.onPrimary, t.primary)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(t.accentText, base.background)).toBeGreaterThanOrEqual(4.5);
            checked++;
          }
        }
    expect(checked).toBeGreaterThan(1000);
    console.info(`QA-COUNT mobile.tint.colors ${checked}`);
  });

  it('keeps the hue of the dish', () => {
    const tomato: RGB = [214, 48, 49];
    const t = tintFor(tomato, lightColors, false);
    const [h] = rgbToHsl(hexToRgb(t.primary));
    expect(Math.abs(h - rgbToHsl(tomato)[0])).toBeLessThan(0.03);
  });

  it('the colour of a photo: vivid food over a white plate and a dark table', () => {
    const px: RGB[] = [
      ...Array.from({ length: 50 }, () => [250, 250, 248] as RGB),
      ...Array.from({ length: 30 }, () => [20, 20, 22] as RGB),
      ...Array.from({ length: 20 }, () => [200, 60, 40] as RGB),
    ];
    const c = dominantColor(px)!;
    expect(c[0]).toBeGreaterThan(150);
    expect(c[1]).toBeLessThan(100);
    expect(dominantColor(Array.from({ length: 10 }, () => [128, 128, 128] as RGB))).toBeNull();
  });

  it('every category photo has a colour', () => {
    expect(Object.keys(CATEGORY_TINTS)).toHaveLength(16);
  });
});

function hexToRgb(h: string): RGB {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}
