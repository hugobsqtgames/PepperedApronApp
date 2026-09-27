import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Icon, Text, type IconName } from '../../ui';

/** One sheet, four ways to add a recipe. The share extension tip teaches the TikTok/Instagram flow. */
export default function AddSheet() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const options: { icon: IconName; title: string; body: string; go: () => void; testID: string }[] = [
    { icon: 'create-outline', title: t('add.blank'), body: t('add.blankBody'), go: () => router.replace('/recipe/edit'), testID: 'add-blank' },
    { icon: 'link-outline', title: t('add.link'), body: t('add.linkBody'), go: () => router.replace('/import/link'), testID: 'add-link' },
    { icon: 'document-text-outline', title: t('add.text'), body: t('add.textBody'), go: () => router.replace('/import/text'), testID: 'add-text' },
    { icon: 'camera-outline', title: t('add.photo'), body: t('add.photoBody'), go: () => router.replace('/import/photo'), testID: 'add-photo' },
  ];
  return (
    <View style={{ padding: space.xl, gap: space.md, backgroundColor: colors.background }}>
      <Text variant="title2" accessibilityRole="header">
        {t('add.title')}
      </Text>
      {options.map((o) => (
        <Pressable key={o.title} testID={o.testID} accessibilityRole="button" accessibilityLabel={`${o.title}. ${o.body}`} onPress={o.go} style={({ pressed }) => [styles.option, { backgroundColor: pressed ? colors.surfaceMuted : colors.surface, borderColor: colors.line }]}>
          <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
            <Icon name={o.icon} size={22} color="primary" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{o.title}</Text>
            <Text variant="caption" color="textMuted">
              {o.body}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color="textSubtle" />
        </Pressable>
      ))}
      <View style={[styles.tip, { backgroundColor: colors.accentSoft }]}>
        <Icon name="share-outline" size={18} color="accent" />
        <Text variant="caption" style={{ flex: 1 }}>
          {t('add.shareTip')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, minHeight: 64 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tip: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.lg, alignItems: 'center' },
});
