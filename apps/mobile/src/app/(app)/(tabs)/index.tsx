import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { computeTotalMinutes, toIsoDate, type RecipeCategory } from '@pepperedapron/core';
import { AdSlot } from '../../../features/AdSlot';
import { CategoryGrid } from '../../../features/home/CategoryGrid';
import { RecipeCarousel } from '../../../features/home/Carousel';
import { useLive, useRepos, useRuntime, useSettings } from '../../../hooks/runtime';
import { useLayout } from '../../../lib/layout';
import { recipePhotoUri } from '../../../lib/media';
import { haptic } from '../../../services/haptics';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import {
  Card,
  EmptyState,
  Icon,
  IconButton,
  RecipePhoto,
  Screen,
  Section,
  Text,
  useToast,
} from '../../../ui';

function greeting(t: TFunction, firstName: string | null, d = new Date()) {
  const h = d.getHours();
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  return firstName ? t(`home.${part}Name`, { name: firstName }) : t(`home.${part}`);
}

export default function Home() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rt = useRuntime();
  const repos = useRepos();
  const settings = useSettings();
  const layout = useLayout();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const today = toIsoDate(new Date());

  const data = useLive(
    ['recipe', 'favorite', 'mealPlanEntry'],
    (r) => {
      const library = r.library();
      const favs = r.favoriteRecipes();
      const counts: Partial<Record<RecipeCategory, number>> = {};
      for (const x of library)
        if (x.data.category) counts[x.data.category] = (counts[x.data.category] ?? 0) + 1;
      return {
        library,
        favorites: favs.slice(0, 12),
        favoriteIds: new Set(favs.map((f) => f.id)),
        quick: library
          .filter((x) => {
            const m = computeTotalMinutes(x.data);
            return m !== null && m <= 30;
          })
          .slice(0, 12),
        recent: [...library].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12),
        todayMeals: r
          .entries(today, today)
          .map((e) => ({ entry: e, recipe: e.data.recipeId ? r.recipe(e.data.recipeId) : null })),
        counts,
      };
    },
    [today],
  );

  const random = () => {
    const r = repos.randomRecipe();
    if (!r) return toast(t('home.randomEmpty'), { tone: 'info' });
    haptic.selection();
    router.push(`/recipe/${r.id}`);
  };

  /** Pull to refresh fetches what the user's other devices put in iCloud. */
  const refresh = async () => {
    setRefreshing(true);
    await rt.syncNow();
    setRefreshing(false);
  };

  const empty = data.library.length === 0;

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={rt.session?.cloud ? refresh : undefined}
      testID="home"
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: space.md,
          paddingTop: space.lg,
        }}
      >
        <View style={{ flex: 1, gap: space.xs }}>
          <Text variant="callout" color="textMuted">
            {greeting(t, settings.firstName)}
          </Text>
          <Text variant="hero" accessibilityRole="header">
            {t('home.question')}
          </Text>
        </View>
        {!layout.sidebar ? (
          <IconButton
            icon="heart-outline"
            label={t('tabs.favorites')}
            onPress={() => router.push('/favorites')}
            testID="open-favorites"
          />
        ) : null}
        {!layout.sidebar ? (
          <IconButton
            icon="person-circle-outline"
            label={t('tabs.profile')}
            onPress={() => router.push('/profile')}
            testID="open-profile"
          />
        ) : null}
      </View>

      <View style={{ gap: space.xxxl, marginTop: space.xl }}>
        {empty ? (
          <Card style={{ paddingVertical: space.lg }}>
            <EmptyState
              emoji="🍴"
              title={t('home.emptyTitle')}
              body={t('home.emptyBody')}
              action={t('home.addFirst')}
              onAction={() => router.push('/add')}
              secondary={t('home.importLink')}
              onSecondary={() => router.push('/import/link')}
              testID="home-empty"
            />
          </Card>
        ) : (
          <>
            <Section title={t('home.today')}>
              {data.todayMeals.length ? (
                <View style={{ gap: space.sm }}>
                  {data.todayMeals.map(({ entry, recipe }) => (
                    <Card
                      key={entry.id}
                      padded={false}
                      onPress={() =>
                        recipe ? router.push(`/recipe/${recipe.id}`) : router.push('/planning')
                      }
                      accessibilityLabel={`${t(`slots.${entry.data.slot}`)}: ${recipe?.data.title ?? entry.data.customTitle}`}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: space.md,
                          padding: space.md,
                        }}
                      >
                        <RecipePhoto
                          uri={recipe ? recipePhotoUri(recipe) : null}
                          category={recipe?.data.category ?? null}
                          radius={radius.md}
                          style={{ width: 56, height: 56 }}
                          emojiSize={24}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            variant="micro"
                            color="accent"
                            style={{ textTransform: 'uppercase' }}
                          >
                            {t(`slots.${entry.data.slot}`)}
                          </Text>
                          <Text variant="bodyStrong" numberOfLines={2}>
                            {recipe?.data.title ?? entry.data.customTitle}
                          </Text>
                        </View>
                        {recipe ? (
                          <IconButton
                            icon="play"
                            label={t('recipe.startCooking')}
                            variant="primary"
                            onPress={() => router.push(`/recipe/${recipe.id}/cook`)}
                          />
                        ) : null}
                      </View>
                    </Card>
                  ))}
                </View>
              ) : (
                <Card
                  onPress={() => router.push('/planning')}
                  accessibilityLabel={t('home.planSomething')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <Icon name="calendar-outline" size={26} color="primary" />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{t('home.nothingPlanned')}</Text>
                      <Text variant="callout" color="primary">
                        {t('home.planSomething')}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={18} color="textSubtle" />
                  </View>
                </Card>
              )}
            </Section>

            <Pressable
              accessibilityRole="button"
              onPress={random}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  padding: space.lg,
                  borderRadius: radius.xl,
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
              testID="random-recipe"
            >
              <Text style={{ fontSize: 28 }} maxFontSizeMultiplier={1}>
                🎲
              </Text>
              <Text variant="title3" style={{ color: colors.onPrimary, flex: 1 }}>
                {t('home.random')}
              </Text>
              <Icon name="arrow-forward" size={20} tint={colors.onPrimary} />
            </Pressable>

            {data.favorites.length ? (
              <Section
                title={t('home.favorites')}
                action={t('common.seeAll')}
                onAction={() => router.push('/favorites')}
              >
                <RecipeCarousel
                  recipes={data.favorites}
                  repos={repos}
                  favorites={data.favoriteIds}
                  wide
                />
              </Section>
            ) : null}
            {data.quick.length ? (
              <Section
                title={t('home.quick')}
                action={t('common.seeAll')}
                onAction={() => router.push({ pathname: '/search', params: { maxMinutes: '30' } })}
              >
                <RecipeCarousel recipes={data.quick} repos={repos} favorites={data.favoriteIds} />
              </Section>
            ) : null}
            <AdSlot placement="home" />
            <Section title={t('home.recent')}>
              <RecipeCarousel recipes={data.recent} repos={repos} favorites={data.favoriteIds} />
            </Section>
          </>
        )}

        <Section title={t('home.categories')}>
          <CategoryGrid counts={data.counts} />
        </Section>
      </View>
    </Screen>
  );
}
