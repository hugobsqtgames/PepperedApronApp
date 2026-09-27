import type { Ref } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useLayout } from '../../../lib/layout';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import { Icon, SyncIndicator, Text, type IconName } from '../../../ui';

const TABS: { name: string; href: '/' | '/search' | '/favorites' | '/planning' | '/shopping'; icon: IconName; iconActive: IconName; label: 'home' | 'search' | 'favorites' | 'planning' | 'shopping' }[] = [
  { name: 'index', href: '/', icon: 'home-outline', iconActive: 'home', label: 'home' },
  { name: 'search', href: '/search', icon: 'search-outline', iconActive: 'search', label: 'search' },
  { name: 'favorites', href: '/favorites', icon: 'heart-outline', iconActive: 'heart', label: 'favorites' },
  { name: 'planning', href: '/planning', icon: 'calendar-outline', iconActive: 'calendar', label: 'planning' },
  { name: 'shopping', href: '/shopping', icon: 'cart-outline', iconActive: 'cart', label: 'shopping' },
];

type TabButtonProps = TabTriggerSlotProps & { icon: IconName; iconActive: IconName; label: string; vertical?: boolean; ref?: Ref<View> };

function TabButton({ icon, iconActive, label, isFocused, vertical, ...props }: TabButtonProps) {
  const { colors } = useTheme();
  const color = isFocused ? colors.primary : colors.textSubtle;
  if (vertical) {
    return (
      <Pressable {...props} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: !!isFocused }} style={[styles.sideItem, isFocused && { backgroundColor: colors.primarySoft }]}>
        <Icon name={isFocused ? iconActive : icon} size={22} tint={isFocused ? colors.primary : colors.textMuted} />
        <Text variant="body" style={{ color: isFocused ? colors.primary : colors.text, fontWeight: isFocused ? '600' : '400' }} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable {...props} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: !!isFocused }} style={styles.tabItem}>
      <Icon name={isFocused ? iconActive : icon} size={24} tint={color} />
      <Text variant="micro" style={{ color, letterSpacing: 0 }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Phone: bottom tab bar with a central "+" to add a recipe.
 * iPad / large screens: a persistent sidebar (tabs + add + profile) next to the content.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const layout = useLayout();

  const triggers = (vertical: boolean) =>
    TABS.map((tab) => (
      <TabTrigger key={tab.name} name={tab.name} asChild>
        <TabButton icon={tab.icon} iconActive={tab.iconActive} label={t(`tabs.${tab.label}`)} vertical={vertical} />
      </TabTrigger>
    ));

  const addButton = (
    <Pressable accessibilityRole="button" accessibilityLabel={t('tabs.add')} onPress={() => router.push('/add')} style={({ pressed }) => [styles.add, { backgroundColor: colors.accent, transform: [{ scale: pressed ? 0.94 : 1 }] }]} testID="tab-add">
      <Icon name="add" size={30} tint={colors.onAccent} />
    </Pressable>
  );

  return (
    <Tabs>
      <View style={{ flex: 1, flexDirection: layout.sidebar ? 'row' : 'column', backgroundColor: colors.background }}>
        {layout.sidebar ? (
          <View style={[styles.sidebar, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg, borderRightColor: colors.line, backgroundColor: colors.surface }]}>
            <View style={styles.sideBrand}>
              <Image source={dark ? require('../../../../assets/brand/mark-dark.png') : require('../../../../assets/brand/mark.png')} style={{ width: 36, height: 36 }} accessibilityIgnoresInvertColors />
              <Text variant="title2">PepperedApron</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/add')} style={({ pressed }) => [styles.sideAdd, { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 }]}>
              <Icon name="add" size={22} tint={colors.onAccent} />
              <Text variant="bodyStrong" style={{ color: colors.onAccent }}>
                {t('tabs.add')}
              </Text>
            </Pressable>
            <View style={{ gap: 2 }}>{triggers(true)}</View>
            <View style={{ flex: 1 }} />
            <SyncIndicator />
            <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={({ pressed }) => [styles.sideItem, pressed && { backgroundColor: colors.surfaceMuted }]}>
              <Icon name="person-circle-outline" size={22} color="textMuted" />
              <Text variant="body">{t('tabs.profile')}</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <TabSlot />
        </View>
        {!layout.sidebar ? (
          <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm), backgroundColor: colors.tabBar, borderTopColor: colors.line }]} accessibilityRole="tablist">
            {triggers(false).slice(0, 2)}
            <View style={styles.tabItem}>{addButton}</View>
            {triggers(false).slice(2)}
          </View>
        ) : null}
      </View>
      <TabList style={{ display: 'none' }}>
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} />
        ))}
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 50 },
  add: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: -18, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  sidebar: { width: 260, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, gap: space.md },
  sideBrand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, marginBottom: space.sm },
  sideAdd: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, minHeight: 48, borderRadius: radius.lg },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, minHeight: 46, borderRadius: radius.md },
});
