import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { RecipeCategory } from '@pepperedapron/core';
import { CATEGORY_PHOTOS, HOME_CATEGORIES } from '../../lib/categories';
import { tileWidth, useLayout } from '../../lib/layout';
import { radius, space } from '../../theme/tokens';
import { Text } from '../../ui';

/** Photo tiles (real food photography) for each category, with the user's recipe count. */
export function CategoryGrid({
  counts,
  limit,
}: {
  counts: Partial<Record<RecipeCategory, number>>;
  limit?: number;
}) {
  const { t } = useTranslation();
  const layout = useLayout();
  const cols = Math.max(2, layout.columns - (layout.sidebar ? 1 : 0));
  const available = layout.sidebar ? layout.width - 260 : layout.width;
  const w = tileWidth(
    Math.min(available, layout.contentMaxWidth + layout.gutter * 2),
    cols,
    space.md,
    layout.gutter,
  );
  const cats = HOME_CATEGORIES.slice(0, limit ?? HOME_CATEGORIES.length);
  return (
    <View style={styles.grid}>
      {cats.map((c) => (
        <Pressable
          key={c}
          accessibilityRole="button"
          accessibilityLabel={`${t(`categories.${c}`)}, ${t('common.recipes', { count: counts[c] ?? 0 })}`}
          onPress={() => router.push({ pathname: '/search', params: { category: c } })}
          style={({ pressed }) => [
            {
              width: w,
              height: Math.round(w * 0.72),
              borderRadius: radius.xl,
              overflow: 'hidden',
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <Image
            source={CATEGORY_PHOTOS[c]}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          <View style={styles.scrim} />
          <View style={styles.label}>
            <Text
              variant="bodyStrong"
              style={{ color: '#FFFCF6', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 }}
              numberOfLines={2}
            >
              {t(`categories.${c}`)}
            </Text>
            {counts[c] ? (
              <Text variant="caption" style={{ color: 'rgba(255,252,246,0.9)' }}>
                {t('common.recipes', { count: counts[c] })}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(18,24,20,0.28)',
  },
  label: { position: 'absolute', left: space.md, right: space.md, bottom: space.md, gap: 2 },
});
