import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSyncStatus } from '../hooks/runtime';
import { runtime } from '../services/runtime';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Icon } from './Icon';
import { Text } from './Text';

/** Discreet status pill: only visible when there is something to say (offline, pending, error). */
export function SyncIndicator() {
  const s = useSyncStatus();
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (s.status === 'idle' && s.pending === 0) return null;
  if (s.status === 'syncing' && s.pending === 0) return null;
  const offline = s.status === 'offline';
  const error = s.status === 'error';
  const label = offline ? t('sync.offline') : error ? t('sync.error') : s.status === 'signedOut' ? t('errors.session_expired') : t('sync.pending');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={error ? t('common.retry') : undefined}
      onPress={() => runtime.syncNow()}
      style={[styles.pill, { backgroundColor: error ? colors.dangerSoft : colors.surfaceMuted }]}
    >
      <Icon name={offline ? 'cloud-offline-outline' : error ? 'alert-circle-outline' : 'sync-outline'} size={14} tint={error ? colors.danger : colors.textMuted} />
      <Text variant="caption" numberOfLines={1} style={{ color: error ? colors.danger : colors.textMuted, flexShrink: 1 }}>
        {error ? `${t('sync.error')} ${t('common.retry')}` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({ pill: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, alignSelf: 'flex-start' } });
