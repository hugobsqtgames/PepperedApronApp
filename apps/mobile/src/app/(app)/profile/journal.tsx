import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { RecipeCategory } from '@pepperedapron/core';
import { useLive } from '../../../hooks/runtime';
import { dayMonth } from '../../../lib/dates';
import { useLayout } from '../../../lib/layout';
import { photoUri, recipePhotoUri } from '../../../lib/media';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import { EmptyState, RecipePhoto, Text } from '../../../ui';

/**
 * Cooking journal: everything cooked, month by month, as a wall of photos. The user's own
 * photo of the dish when there is one; else the recipe's, softened, with the date on it.
 */
export default function Journal() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const layout = useLayout();
  const cols = layout.isTablet ? 5 : 3;
  const gap = space.xs;
  const tile = Math.floor((Math.min(layout.width, 900) - space.lg * 2 - gap * (cols - 1)) / cols);
  const sections = useLive(
    ['cookLog', 'recipe'],
    (r) => {
      const months = new Map<
        string,
        {
          id: string;
          recipeId: string;
          title: string;
          date: string;
          own: string | null;
          fallback: string | null;
          category: RecipeCategory | null;
        }[]
      >();
      for (const l of r.allCookLogs()) {
        const rec = r.recipe(l.data.recipeId);
        if (!rec) continue;
        const key = l.data.date.slice(0, 7);
        const list = months.get(key) ?? [];
        list.push({
          id: l.id,
          recipeId: rec.id,
          title: rec.data.title,
          date: l.data.date,
          own: l.data.photoKey ? photoUri(l.data.photoKey) : null,
          fallback: recipePhotoUri(rec),
          category: rec.data.category,
        });
        months.set(key, list);
      }
      return [...months].map(([month, items]) => ({
        month,
        count: items.length,
        data: chunk(items, cols),
      }));
    },
    [cols],
  );
  const total = sections.reduce((n, s) => n + s.count, 0);
  const monthName = (m: string) =>
    new Date(`${m}-15T12:00:00`).toLocaleDateString(i18n.language, {
      month: 'long',
      year: 'numeric',
    });

  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      sections={sections}
      keyExtractor={(row) => row.map((x) => x.id).join()}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{
        padding: space.lg,
        gap,
        maxWidth: 900,
        width: '100%',
        alignSelf: 'center',
      }}
      ListHeaderComponent={
        total ? (
          <View style={{ gap: 2, marginBottom: space.md }}>
            <Text variant="kicker" color="accent">
              {t('delight.journal.kicker')}
            </Text>
            <Text variant="lede" color="textMuted">
              {t('delight.journal.count', { count: total })}
            </Text>
          </View>
        ) : undefined
      }
      renderSectionHeader={({ section }) => (
        <Text
          variant="title2"
          style={{ marginTop: space.lg, marginBottom: space.sm, textTransform: 'capitalize' }}
          accessibilityRole="header"
        >
          {monthName(section.month)}
        </Text>
      )}
      renderItem={({ item: row }) => (
        <View style={{ flexDirection: 'row', gap, marginBottom: gap }}>
          {row.map((x) => (
            <Pressable
              key={x.id}
              accessibilityRole="button"
              accessibilityLabel={`${x.title}, ${dayMonth(x.date, i18n.language)}`}
              onPress={() => router.push(`/recipe/${x.recipeId}`)}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              testID="journal-tile"
            >
              {x.own ? (
                <Image
                  source={{ uri: x.own }}
                  style={{ width: tile, height: tile, borderRadius: radius.md }}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View style={{ opacity: 0.55 }}>
                  <RecipePhoto
                    uri={x.fallback}
                    category={x.category}
                    radius={radius.md}
                    style={{ width: tile, height: tile }}
                    emojiSize={28}
                  />
                </View>
              )}
              <View
                style={[
                  styles.date,
                  { backgroundColor: x.own ? 'rgba(0,0,0,0.45)' : colors.surface },
                ]}
              >
                <Text variant="micro" style={{ color: x.own ? '#FFFCF6' : colors.text }}>
                  {dayMonth(x.date, i18n.language)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      ListEmptyComponent={
        <EmptyState
          emoji="📸"
          title={t('delight.journal.title')}
          body={t('delight.journal.empty')}
        />
      }
    />
  );
}

function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

const styles = StyleSheet.create({
  date: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
});
