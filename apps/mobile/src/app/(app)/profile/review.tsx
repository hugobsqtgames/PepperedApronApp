import { useRef, useState } from 'react';
import { ScrollView, View, type HostInstance } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CUISINE_COUNTRY, flagOf, yearReview } from '@pepperedapron/core';
import { kitchenHistory } from '../../../features/kitchen';
import { useLive } from '../../../hooks/runtime';
import { recipePhotoUri } from '../../../lib/media';
import { palette, radius, space } from '../../../theme/tokens';
import { Button, Card, Chip, EmptyState, RecipePhoto, Text, useToast } from '../../../ui';

const CREAM = palette.cream;
/** Light paprika for small text on the green card: 5.3:1 (the brand paprika is only 3.7:1). */
const PEACH = '#F4B183';
const SOFT = 'rgba(242,236,225,0.88)';

/**
 * The year in the kitchen, like a music app's "Wrapped": what was cooked, the star dish, the
 * favourite cuisine, month by month. Can be shared as an image.
 */
export default function YearReview() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const data = useLive(['cookLog', 'recipe'], (r) => {
    const h = kitchenHistory(r);
    const years = [...new Set(h.logs.map((l) => Number(l.date.slice(0, 4))))].sort((a, b) => b - a);
    return { h, years: years.length ? years : [thisYear], recipe: (id: string) => r.recipe(id) };
  });
  const [year, setYear] = useState(data.years[0]!);
  const y = yearReview(data.h.logs, data.h.facts, year);
  const card = useRef<HostInstance>(null);
  const star = y.topRecipes[0] ? data.recipe(y.topRecipes[0].recipeId) : null;
  const maxMonth = Math.max(1, ...y.byMonth);
  const months = Array.from({ length: 12 }, (_, m) =>
    new Date(2026, m, 1).toLocaleDateString(i18n.language, { month: 'narrow' }),
  );
  const weekday =
    y.favoriteWeekday === null
      ? null
      : new Date(2026, 10, 1 + y.favoriteWeekday).toLocaleDateString(i18n.language, {
          weekday: 'long',
        });

  const share = async () => {
    try {
      const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
    } catch {
      toast(t('errors.generic'), { tone: 'error' });
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: space.lg,
        gap: space.lg,
        maxWidth: 640,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      {data.years.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {data.years.map((x) => (
            <Chip key={x} label={String(x)} selected={x === year} onPress={() => setYear(x)} />
          ))}
        </View>
      ) : null}
      {!y.cooks ? (
        <EmptyState
          emoji="🗓️"
          title={t('delight.review.title', { year })}
          body={t('delight.review.empty', { year })}
        />
      ) : (
        <>
          <View
            ref={card}
            collapsable={false}
            style={{
              backgroundColor: palette.forest,
              borderRadius: radius.xxl,
              padding: space.xxl,
              gap: space.xl,
            }}
            testID="year-review"
          >
            <View style={{ gap: space.xs }}>
              <Text variant="kicker" style={{ color: PEACH }}>
                {t('delight.review.kicker')}
              </Text>
              <Text variant="hero" style={{ color: CREAM }} accessibilityRole="header">
                {t('delight.review.title', { year })}
              </Text>
            </View>
            <View style={{ gap: 2 }}>
              <Text
                style={{
                  fontFamily: 'Fraunces_700Bold',
                  fontSize: 64,
                  lineHeight: 70,
                  color: CREAM,
                }}
                maxFontSizeMultiplier={1.2}
              >
                {y.cooks}
              </Text>
              <Text variant="title3" style={{ color: CREAM }}>
                {t('delight.review.cooks', { count: y.cooks })}
              </Text>
              <Text variant="lede" style={{ color: SOFT }}>
                {t('delight.review.recipes', { count: y.distinctRecipes })}
                {y.newRecipes ? `, ${t('delight.review.newOnes', { count: y.newRecipes })}` : ''}
              </Text>
            </View>
            {star ? (
              <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                <RecipePhoto
                  uri={recipePhotoUri(star)}
                  category={star.data.category}
                  radius={radius.lg}
                  style={{ width: 84, height: 84 }}
                  emojiSize={32}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="kicker" style={{ color: PEACH }}>
                    {t('delight.review.topRecipe')}
                  </Text>
                  <Text variant="title2" style={{ color: CREAM }} numberOfLines={2}>
                    {star.data.title}
                  </Text>
                  <Text variant="callout" style={{ color: SOFT }}>
                    {t('delight.review.times', { count: y.topRecipes[0]!.count })}
                  </Text>
                </View>
              </View>
            ) : null}
            {y.topCuisine ? (
              <View style={{ gap: 2 }}>
                <Text variant="kicker" style={{ color: PEACH }}>
                  {t('delight.review.topCuisine')}
                </Text>
                <Text variant="title2" style={{ color: CREAM }}>
                  {flagOf(CUISINE_COUNTRY[y.topCuisine])} {t(`delight.cuisines.${y.topCuisine}`)}
                </Text>
              </View>
            ) : null}
            <View style={{ gap: space.sm }}>
              <Text variant="kicker" style={{ color: PEACH }}>
                {t('delight.review.byMonth')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 90 }}>
                {y.byMonth.map((n, m) => (
                  <View key={m} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <View
                      style={{
                        width: '100%',
                        height: Math.max(3, (n / maxMonth) * 70),
                        borderRadius: 4,
                        backgroundColor: n ? palette.paprikaLight : 'rgba(242,236,225,0.2)',
                      }}
                    />
                    <Text variant="micro" style={{ color: SOFT }} maxFontSizeMultiplier={1}>
                      {months[m]}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={{ gap: space.xs }}>
              {weekday ? (
                <Text variant="callout" style={{ color: CREAM }}>
                  📅 {t('delight.review.favoriteDay', { day: weekday })}
                </Text>
              ) : null}
              {y.vegetarianShare ? (
                <Text variant="callout" style={{ color: CREAM }}>
                  🥕 {t('delight.review.veggie', { pct: Math.round(y.vegetarianShare * 100) })}
                </Text>
              ) : null}
              {y.photos ? (
                <Text variant="callout" style={{ color: CREAM }}>
                  📸 {t('delight.review.photos', { count: y.photos })}
                </Text>
              ) : null}
            </View>
            <Text variant="micro" style={{ color: SOFT }}>
              PepperedApron
            </Text>
          </View>
          <Button
            title={t('delight.review.share')}
            icon="share-outline"
            size="lg"
            full
            onPress={() => void share()}
            testID="review-share"
          />
          <Card
            onPress={() => router.push('/profile/journal')}
            accessibilityLabel={t('delight.journal.open')}
          >
            <Text variant="bodyStrong" color="primary">
              {t('delight.journal.open')} →
            </Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}
