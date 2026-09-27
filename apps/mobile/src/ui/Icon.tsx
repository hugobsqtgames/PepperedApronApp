import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color = 'text', tint }: { name: IconName; size?: number; color?: keyof ThemeColors; tint?: string }) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={tint ?? colors[color]} accessibilityElementsHidden importantForAccessibility="no" />;
}
