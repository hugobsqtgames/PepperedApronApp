import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLive } from '../../hooks/runtime';
import { formatMoney } from '../../lib/money';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Text } from '../../ui';

/** Planning: the week at a glance (meals planned and cooked, vegetarian share, budget, classics). */
export function WeekSummary({ start, end }: { start: string; end: string }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { s, titles } = useLive(
    ['mealPlanEntry', 'cookLog', 'recipe', 'shoppingItem'],
    (r) => {
      const s = r.weekSummary(start, end);
      return {
        s,
        titles: s.favorites.map((f) => ({ ...f, title: r.recipe(f.recipeId)?.data.title ?? '' })),
      };
    },
    [start, end],
  );
  if (!s.planned && !s.cooked) return null;
  const tiles: { value: string; label: string }[] = [
    { value: String(s.planned), label: t('summary.planned', { count: s.planned }) },
    { value: String(s.cooked), label: t('summary.cooked', { count: s.cooked }) },
  ];
  if (s.vegetarianShare !== null)
    tiles.push({
      value: `${Math.round(s.vegetarianShare * 100)} %`,
      label: t('summary.vegetarian'),
    });
  if (s.budget !== null)
    tiles.push({ value: formatMoney(s.budget, i18n.language), label: t('summary.budget') });
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Text variant="title3" accessibilityRole="header">
        {t('summary.title')}
      </Text>
      <View style={styles.tiles}>
        {tiles.map((x) => (
          <View
            key={x.label}
            style={[styles.tile, { backgroundColor: colors.primarySoft }]}
            accessible
            accessibilityLabel={`${x.value} ${x.label}`}
          >
            <Text variant="title2" color="primary">
              {x.value}
            </Text>
            <Text variant="caption" color="textMuted">
              {x.label}
            </Text>
          </View>
        ))}
      </View>
      {titles.filter((f) => f.title).length ? (
        <View style={{ gap: space.xs }}>
          <Text variant="caption" color="textMuted" weight="600">
            {t('summary.classics')}
          </Text>
          {titles
            .filter((f) => f.title)
            .map((f) => (
              <Text
                key={f.recipeId}
                variant="callout"
                accessibilityRole="link"
                onPress={() => router.push(`/recipe/${f.recipeId}`)}
              >
                {f.title} · {t('summary.times', { count: f.count })}
              </Text>
            ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    flexGrow: 1,
    flexBasis: 120,
    gap: 2,
    padding: space.md,
    borderRadius: radius.lg,
  },
});
