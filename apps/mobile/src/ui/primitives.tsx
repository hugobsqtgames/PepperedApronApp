import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, TOUCH } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function Card({ children, onPress, style, padded = true, accessibilityLabel }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; padded?: boolean; accessibilityLabel?: string }) {
  const { colors, dark } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: padded ? space.lg : 0,
    borderWidth: dark ? StyleSheet.hairlineWidth : 0,
    borderColor: colors.line,
    shadowColor: colors.shadow,
    shadowOpacity: dark ? 0 : 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: dark ? 0 : 2,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }, style]}>
      {children}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon, testID }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.line, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {icon ? <Icon name={icon} size={15} tint={selected ? colors.onPrimary : colors.textMuted} /> : null}
      <Text variant="callout" style={{ color: selected ? colors.onPrimary : colors.text, fontWeight: selected ? '600' : '400' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
      {children}
    </ScrollView>
  );
}

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'primary' | 'accent' | 'danger'; icon?: IconName }) {
  const { colors } = useTheme();
  const bg = { neutral: colors.surfaceMuted, primary: colors.primarySoft, accent: colors.accentSoft, danger: colors.dangerSoft }[tone];
  const fg = { neutral: colors.textMuted, primary: colors.primary, accent: colors.accent, danger: colors.danger }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={13} tint={fg} /> : null}
      <Text variant="caption" style={{ color: fg, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

export function Section({ title, action, onAction, children, style }: { title: string; action?: string; onAction?: () => void; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: space.md }, style]}>
      <View style={styles.sectionHead}>
        <Text variant="title2" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Text>
        {action && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction} hitSlop={12} style={{ minHeight: TOUCH, justifyContent: 'center' }}>
            <Text variant="callout" color="primary" weight="600">
              {action}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
  danger,
  toggle,
  onToggle,
  chevron = !!onPress,
  testID,
  right,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  toggle?: boolean;
  onToggle?: (v: boolean) => void;
  chevron?: boolean;
  testID?: string;
  right?: ReactNode;
}) {
  const { colors } = useTheme();
  const content = (
    <>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: danger ? colors.dangerSoft : colors.primarySoft }]}>
          <Icon name={icon} size={18} tint={danger ? colors.danger : colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" style={{ color: danger ? colors.danger : colors.text }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="callout" color="textMuted" numberOfLines={1} style={{ maxWidth: '45%' }}>
          {value}
        </Text>
      ) : null}
      {right}
      {toggle !== undefined ? (
        <Switch value={toggle} onValueChange={onToggle} trackColor={{ true: colors.primary, false: colors.line }} accessibilityLabel={title} />
      ) : chevron ? (
        <Icon name="chevron-forward" size={18} color="textSubtle" />
      ) : null}
    </>
  );
  if (toggle !== undefined || !onPress) {
    return (
      <View testID={testID} style={styles.listRow} accessible={toggle === undefined} accessibilityLabel={toggle === undefined ? [title, subtitle, value].filter(Boolean).join(', ') : undefined}>
        {content}
      </View>
    );
  }
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={[title, value].filter(Boolean).join(', ')} accessibilityHint={subtitle} onPress={onPress} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.surfaceMuted }]}>
      {content}
    </Pressable>
  );
}

export function Group({ children, title, footer }: { children: ReactNode; title?: string; footer?: string }) {
  const { colors } = useTheme();
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={{ gap: space.sm }}>
      {title ? (
        <Text variant="micro" color="textMuted" style={{ textTransform: 'uppercase', marginLeft: space.lg }}>
          {title}
        </Text>
      ) : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line }}>
        {items.map((c, i) => (
          <View key={i}>
            {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: space.lg }} /> : null}
            {c}
          </View>
        ))}
      </View>
      {footer ? (
        <Text variant="caption" color="textMuted" style={{ marginHorizontal: space.lg }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export function Stepper({ value, onChange, min = 1, max = 100, label, testID }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; testID?: string }) {
  const { colors } = useTheme();
  const btn = (delta: number, icon: IconName, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={delta < 0 ? value <= min : value >= max}
      onPress={() => onChange(Math.min(max, Math.max(min, value + delta)))}
      hitSlop={8}
      style={({ pressed }) => [styles.stepBtn, { backgroundColor: colors.surfaceRaised, opacity: (delta < 0 ? value <= min : value >= max) ? 0.35 : pressed ? 0.7 : 1 }]}
    >
      <Icon name={icon} size={18} color="primary" />
    </Pressable>
  );
  return (
    <View testID={testID} style={[styles.stepper, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ now: value, min, max }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(e) => onChange(Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
      {btn(-1, 'remove', '−')}
      <Text variant="bodyStrong" style={{ minWidth: 36 }} align="center">
        {value}
      </Text>
      {btn(1, 'add', '+')}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(o.value)} style={[styles.segment, selected && { backgroundColor: colors.surfaceRaised, shadowColor: colors.shadow, shadowOpacity: 1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }]}>
            <Text variant="callout" style={{ fontWeight: selected ? '600' : '400', color: selected ? colors.text : colors.textMuted }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Skeleton({ width, height, style }: { width?: number | `${number}%`; height: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const o = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true })]));
    a.start();
    return () => a.stop();
  }, [o]);
  return <Animated.View accessibilityElementsHidden style={[{ width: width ?? '100%', height, borderRadius: radius.md, backgroundColor: colors.skeleton, opacity: o }, style]} />;
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />;
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, minHeight: 36, borderRadius: radius.pill, borderWidth: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.pill, padding: 4, alignSelf: 'flex-start' },
  stepBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, minHeight: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
});
