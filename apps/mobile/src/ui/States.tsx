import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';
import { Button } from './Button';
import { Text } from './Text';

export function EmptyState({
  emoji,
  title,
  body,
  action,
  onAction,
  secondary,
  onSecondary,
  testID,
}: {
  emoji: string;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
  secondary?: string;
  onSecondary?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={[styles.bubble, { backgroundColor: colors.accentSoft }]}>
        <Text style={{ fontSize: 40, lineHeight: 48 }} maxFontSizeMultiplier={1}>
          {emoji}
        </Text>
      </View>
      <Text variant="title2" align="center" accessibilityRole="header">
        {title}
      </Text>
      {body ? (
        <Text variant="callout" color="textMuted" align="center" style={{ maxWidth: 360 }}>
          {body}
        </Text>
      ) : null}
      {action && onAction ? (
        <Button title={action} onPress={onAction} style={{ marginTop: space.sm }} />
      ) : null}
      {secondary && onSecondary ? (
        <Button title={secondary} variant="ghost" onPress={onSecondary} />
      ) : null}
    </View>
  );
}

/** Friendly error with retry — never a technical message. */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      emoji="🥄"
      title={message ?? t('errors.generic')}
      action={onRetry ? t('common.retry') : undefined}
      onAction={onRetry}
    />
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('common.loading')}
    >
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? (
        <Text variant="callout" color="textMuted">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingVertical: space.huge,
    paddingHorizontal: space.xxl,
  },
  bubble: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
});
