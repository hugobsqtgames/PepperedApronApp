import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, TOUCH, hitSlop } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';

export interface ButtonProps {
  title: string;
  onPress?: () => unknown;
  variant?: Variant;
  size?: 'md' | 'lg' | 'sm';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * Buttons ignore taps while their async action runs, so spam-tapping "Enregistrer" can never
 * create duplicates.
 */
export function Button({ title, onPress, variant = 'primary', size = 'md', icon, loading, disabled, full, style, accessibilityHint, testID }: ButtonProps) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const bg = { primary: colors.primary, secondary: colors.surfaceMuted, ghost: 'transparent', accent: colors.accent, danger: colors.dangerSoft }[variant];
  const fg = { primary: colors.onPrimary, secondary: colors.text, ghost: colors.primary, accent: colors.onAccent, danger: colors.danger }[variant];
  const isLoading = loading || busy;
  const inactive = disabled || isLoading;
  const h = size === 'lg' ? 56 : size === 'sm' ? 36 : 48;

  const handle = async () => {
    if (lock.current || inactive || !onPress) return;
    lock.current = true;
    try {
      const r = onPress();
      if (r instanceof Promise) {
        setBusy(true);
        await r;
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!isLoading }}
      onPress={handle}
      hitSlop={size === 'sm' ? hitSlop : undefined}
      style={({ pressed }) => [
        styles.base,
        { minHeight: Math.max(h, size === 'sm' ? 36 : TOUCH), backgroundColor: bg, paddingHorizontal: size === 'sm' ? space.md : space.xl, opacity: inactive && !isLoading ? 0.45 : pressed ? 0.85 : 1 },
        variant === 'ghost' && { paddingHorizontal: space.sm },
        full && { alignSelf: 'stretch' },
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 20} tint={fg} /> : null}
          <Text variant={size === 'sm' ? 'caption' : 'bodyStrong'} style={{ color: fg, fontWeight: '600' }} numberOfLines={2} align="center">
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, variant = 'surface', size = 44, color, testID }: { icon: IconName; label: string; onPress: () => void; variant?: 'surface' | 'plain' | 'primary' | 'overlay'; size?: number; color?: string; testID?: string }) {
  const { colors } = useTheme();
  const bg = { surface: colors.surfaceRaised, plain: 'transparent', primary: colors.primary, overlay: 'rgba(18,24,20,0.45)' }[variant];
  const fg = color ?? { surface: colors.text, plain: colors.text, primary: colors.onPrimary, overlay: '#FFFFFF' }[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={hitSlop}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} tint={fg} />
    </Pressable>
  );
}

export function Row({ children, gap = space.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingVertical: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
