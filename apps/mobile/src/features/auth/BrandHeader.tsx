import { Image, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';
import { Text } from '../../ui';

export function BrandHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { dark } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xxl }}>
      <Image source={dark ? require('../../../assets/brand/mark-dark.png') : require('../../../assets/brand/mark.png')} style={{ width: 72, height: 72 }} accessibilityIgnoresInvertColors accessibilityLabel="PepperedApron" />
      <Text variant="title1" align="center" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="callout" color="textMuted" align="center">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
