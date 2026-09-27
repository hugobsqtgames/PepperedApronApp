import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { RecipeCategory } from '@pepperedapron/core';
import { CATEGORY_EMOJI } from '../lib/categories';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

/**
 * Recipe image with graceful fallback: photos are optional, so a recipe without one shows a warm
 * category tile instead of a broken or empty frame. Images are disk-cached by expo-image.
 */
export function RecipePhoto({
  uri,
  category,
  style,
  radius = 0,
  emojiSize = 40,
  recyclingKey,
}: {
  uri: string | null;
  category: RecipeCategory | null;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  emojiSize?: number;
  recyclingKey?: string;
}) {
  const { colors, dark } = useTheme();
  if (!uri) {
    return (
      <View
        style={[
          styles.fallback,
          {
            backgroundColor: dark ? colors.surfaceRaised : colors.surfaceMuted,
            borderRadius: radius,
          },
          style,
        ]}
        accessibilityElementsHidden
      >
        <Text
          style={{ fontSize: emojiSize, lineHeight: emojiSize * 1.2 }}
          maxFontSizeMultiplier={1}
        >
          {CATEGORY_EMOJI[category ?? 'main']}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      recyclingKey={recyclingKey}
      style={[{ borderRadius: radius, backgroundColor: colors.skeleton }, style as never]}
      contentFit="cover"
      transition={180}
      cachePolicy="disk"
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
