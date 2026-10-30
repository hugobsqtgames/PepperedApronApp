import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { bolder } from '../theme/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, type as typeScale, type TypeVariant, type ThemeColors } from '../theme/tokens';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  color?: keyof ThemeColors;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
}

/**
 * Themed text. Dynamic Type is followed up to the largest accessibility sizes (×3.1 for body
 * text); big display titles stop at ×1.6, where they are already larger than body text.
 */
export function Text({
  variant = 'body',
  color = 'text',
  align,
  weight,
  style,
  maxFontSizeMultiplier,
  ...rest
}: TextProps) {
  const { colors, a11y } = useTheme();
  let t = typeScale[variant] as TextStyle;
  // Bold Text (iOS setting) does not reach custom fonts by itself: Fraunces goes to its bold
  // cut, system text one weight heavier.
  if (a11y.boldText)
    t =
      t.fontFamily === fonts.displaySemi
        ? { ...t, fontFamily: fonts.display }
        : t.fontFamily
          ? t
          : { ...t, fontWeight: bolder(t.fontWeight as string | undefined) };
  const display = variant === 'hero' || variant === 'title1' || variant === 'cook';
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? (display ? 1.6 : 3.1)}
      style={[
        t,
        // Text never uses the raw brand paprika: it lacks contrast at small sizes.
        { color: color === 'accent' ? colors.accentText : colors[color] },
        align ? { textAlign: align } : null,
        weight ? { fontWeight: a11y.boldText ? bolder(weight as string) : weight } : null,
        style,
      ]}
    />
  );
}
