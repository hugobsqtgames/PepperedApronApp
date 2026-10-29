import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';

/** 1 to 5 stars; tapping the current rating again clears it. */
export function Stars({
  value,
  onChange,
  size = 28,
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
  size?: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', gap: 2 }}
      accessibilityRole={onChange ? 'adjustable' : 'image'}
      accessibilityLabel={t('rating.label')}
      accessibilityValue={{ text: value ? t('rating.value', { count: value }) : t('rating.none') }}
      accessibilityActions={onChange ? [{ name: 'increment' }, { name: 'decrement' }] : undefined}
      onAccessibilityAction={(e) => {
        if (!onChange) return;
        const cur = value ?? 0;
        const next = e.nativeEvent.actionName === 'increment' ? cur + 1 : cur - 1;
        onChange(next < 1 ? null : Math.min(5, next));
      }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={!onChange}
          onPress={() => onChange?.(value === n ? null : n)}
          hitSlop={4}
          importantForAccessibility="no"
          accessibilityElementsHidden
          testID={`star-${n}`}
        >
          <Icon
            name={value !== null && n <= value ? 'star' : 'star-outline'}
            size={size}
            tint={value !== null && n <= value ? colors.accent : colors.textSubtle}
          />
        </Pressable>
      ))}
    </View>
  );
}
