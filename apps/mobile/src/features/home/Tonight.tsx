import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { computeTotalMinutes, formatMinutes, type Locale } from '@pepperedapron/core';
import type { Recipe } from '@pepperedapron/client';
import { recipePhotoUri } from '../../lib/media';
import { useDishColor } from '../../lib/photoTint';
import { TintScope } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Button, Card, RecipePhoto, Text } from '../../ui';

export type TonightReason = 'planned' | 'pantry' | 'season' | 'favorite' | 'forgotten' | 'any';

/**
 * "Ce soir on mange…": tonight's planned dinner, or else the idea of the day (stable through
 * the day), large, in the colours of the dish, with what to do next.
 */
export function TonightCard({
  recipe,
  reason,
  onPlan,
  width,
}: {
  recipe: Recipe;
  reason: TonightReason;
  onPlan?: () => void;
  width: number;
}) {
  const { t, i18n } = useTranslation();
  const uri = recipePhotoUri(recipe);
  const color = useDishColor(uri, recipe.data.category);
  const minutes = computeTotalMinutes(recipe.data);
  const h = Math.round(Math.min(width * 0.62, 300));
  const why =
    reason === 'planned' ? t('delight.tonight.planned') : t(`delight.tonight.why_${reason}`);
  return (
    <TintScope color={color}>
      <Card padded={false}>
        <Link href={`/recipe/${recipe.id}`} asChild>
          <Pressable
            testID="tonight"
            accessibilityRole="button"
            accessibilityLabel={`${t('delight.tonight.kicker')} ${recipe.data.title}, ${why}`}
            style={{
              height: h,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              overflow: 'hidden',
            }}
          >
            <Link.AppleZoom>
              <RecipePhoto
                uri={uri}
                category={recipe.data.category}
                radius={0}
                style={{ width, height: h }}
                emojiSize={72}
                recyclingKey={recipe.id}
              />
            </Link.AppleZoom>
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(8,12,10,0.8)']}
              locations={[0, 0.4, 1]}
              style={{ position: 'absolute', top: 0, left: 0, width, height: h }}
            />
            <View style={styles.caption}>
              <Text variant="kicker" style={{ color: 'rgba(255,252,246,0.92)' }}>
                {t('delight.tonight.kicker')}
              </Text>
              <Text variant="title1" numberOfLines={3} style={{ color: '#FFFCF6' }}>
                {recipe.data.title}
              </Text>
            </View>
          </Pressable>
        </Link>
        <View style={styles.footer}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="callout" color="accent" weight="600">
              {why}
            </Text>
            {minutes ? (
              <Text variant="caption" color="textMuted">
                {formatMinutes(minutes, i18n.language as Locale)}
              </Text>
            ) : null}
          </View>
          {onPlan ? (
            <Button
              title={t('delight.tonight.plan')}
              icon="calendar-outline"
              variant="secondary"
              size="sm"
              onPress={onPlan}
              testID="tonight-plan"
            />
          ) : null}
          <Button
            title={t('delight.tonight.cook')}
            icon="play"
            size="sm"
            onPress={() => router.push(`/recipe/${recipe.id}/cook`)}
            testID="tonight-cook"
          />
        </View>
      </Card>
    </TintScope>
  );
}

const styles = StyleSheet.create({
  caption: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
    gap: space.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    paddingLeft: space.lg,
    flexWrap: 'wrap',
  },
});
