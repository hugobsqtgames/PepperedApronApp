import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { type as typeScale, type TypeVariant, type ThemeColors } from '../theme/tokens';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  color?: keyof ThemeColors;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
}

/** Themed text. Dynamic Type is respected; very large display text is capped to keep layouts intact. */
export function Text({
  variant = 'body',
  color = 'text',
  align,
  weight,
  style,
  maxFontSizeMultiplier,
  ...rest
}: TextProps) {
  const { colors } = useTheme();
  const t = typeScale[variant] as TextStyle;
  const display = variant === 'hero' || variant === 'title1' || variant === 'cook';
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? (display ? 1.4 : 2)}
      style={[
        t,
        { color: colors[color] },
        align ? { textAlign: align } : null,
        weight ? { fontWeight: weight } : null,
        style,
      ]}
    />
  );
}
