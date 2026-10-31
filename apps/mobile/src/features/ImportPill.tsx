import { Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useImportQueue } from '../hooks/importQueue';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Icon, Text } from '../ui';

/**
 * "2 imports in progress": over every tab while something shared is being read, one tap from
 * the list of imports. Nothing when the queue is idle.
 */
export function ImportPill() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const queue = useImportQueue();
  const left = queue.jobs.filter((j) => j.status === 'pending' || j.status === 'running').length;
  const failed = queue.jobs.filter((j) => j.status === 'failed').length;
  if (!left) return null;
  const paused = queue.pauseReason !== null && queue.pausedUntil > Date.now();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('importPill.label', { count: left })}
      accessibilityHint={t('importPill.hint')}
      accessibilityLiveRegion="polite"
      onPress={() => router.push('/import/queue')}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
      ]}
      testID="import-pill"
    >
      <Icon
        name={paused ? 'pause-circle-outline' : 'cloud-download-outline'}
        size={18}
        tint={colors.onPrimary}
      />
      <Text variant="callout" weight="600" style={{ color: colors.onPrimary }}>
        {paused ? t('importPill.paused', { count: left }) : t('importPill.label', { count: left })}
        {failed ? ` · ${t('importPill.failed', { count: failed })}` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    minHeight: 44,
    borderRadius: radius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
