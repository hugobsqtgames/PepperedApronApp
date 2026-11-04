import { View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CalorieEstimate, NutritionFacts } from '@pepperedapron/core';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Section, Text } from '../../ui';

const SHOWN = 8;
const FACT_KEYS: (keyof NutritionFacts)[] = [
  'kcal',
  'protein',
  'fat',
  'saturated',
  'carbs',
  'sugars',
  'fiber',
  'salt',
];

/**
 * At the bottom of a recipe: the calorie estimate explained (per serving, whole recipe, what
 * each ingredient brings, what could not be counted), and the values the recipe gives itself
 * when it has some ("Calories 1918 | Protéines 42 g…" from the post), shown as written.
 */
export function CaloriesSection({
  estimate,
  facts,
  servings,
  onLayout,
}: {
  estimate: CalorieEstimate | null;
  facts: NutritionFacts | null;
  servings: number;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  if (!estimate && !facts) return null;
  const n = (v: number) => v.toLocaleString(i18n.language, { maximumFractionDigits: 2 });
  const max = estimate?.lines[0]?.kcal ?? 1;
  const rest = estimate ? estimate.lines.length - SHOWN : 0;
  return (
    <View onLayout={onLayout} testID="recipe-calories">
      <Section title={t('calories.title')} kicker={t('calories.kicker')}>
        {estimate ? (
          <View style={{ gap: space.md }}>
            <View
              style={{
                backgroundColor: colors.primarySoft,
                borderRadius: radius.lg,
                padding: space.lg,
                gap: 2,
              }}
            >
              <Text variant="hero" color="primary">
                {t('calories.perServing', { count: estimate.perServing })}
              </Text>
              <Text variant="callout" color="textMuted">
                {t('calories.whole', {
                  total: n(Math.round(estimate.total / 10) * 10),
                  count: servings,
                })}
              </Text>
            </View>
            <View style={{ gap: space.sm }}>
              <Text variant="caption" color="textMuted" weight="600">
                {t('calories.byIngredient')}
              </Text>
              {estimate.lines.slice(0, SHOWN).map((l, i) => (
                <View key={`${l.name}-${i}`} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <Text variant="callout" style={{ flexShrink: 1, flexGrow: 1 }}>
                      {l.name}
                    </Text>
                    <Text variant="callout" weight="600">
                      {t('calories.kcal', { count: l.kcal })}
                    </Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line }}>
                    <View
                      style={{
                        height: 6,
                        borderRadius: 3,
                        width: `${Math.max(2, (l.kcal / max) * 100)}%`,
                        backgroundColor: colors.accent,
                      }}
                    />
                  </View>
                </View>
              ))}
              {rest > 0 ? (
                <Text variant="caption" color="textMuted">
                  {t('calories.others', { count: rest })}
                </Text>
              ) : null}
              {estimate.missing.length ? (
                <Text variant="caption" color="textMuted">
                  {t('recipe.kcalMissing', { names: estimate.missing.join(', ') })}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
        {facts ? (
          <View style={{ gap: space.sm }} testID="recipe-nutrition-facts">
            <Text variant="caption" color="textMuted" weight="600">
              {t('calories.fromRecipe')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {FACT_KEYS.filter((k) => facts[k] !== null).map((k) => (
                <View
                  key={k}
                  style={{
                    backgroundColor: colors.surfaceMuted,
                    borderRadius: radius.md,
                    paddingVertical: space.sm,
                    paddingHorizontal: space.md,
                    minWidth: 96,
                  }}
                >
                  <Text variant="caption" color="textMuted">
                    {t(`calories.facts.${k}`)}
                  </Text>
                  <Text variant="bodyStrong">
                    {k === 'kcal' ? t('calories.kcal', { count: facts[k]! }) : `${n(facts[k]!)} g`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        <Text variant="caption" color="textMuted">
          {t('calories.note')}
        </Text>
      </Section>
    </View>
  );
}
