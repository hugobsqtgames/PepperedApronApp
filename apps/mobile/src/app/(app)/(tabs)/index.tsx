import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { computeTotalMinutes, toIsoDate, type RecipeCategory } from '@pepperedapron/core';
import type { PublicRecipeCard } from '@pepperedapron/client';
import { AdSlot } from '../../../features/AdSlot';
import { CategoryGrid } from '../../../features/home/CategoryGrid';
import { RecipeCarousel } from '../../../features/home/Carousel';
import { useLive, useRepos, useRuntime } from '../../../hooks/runtime';
import { useLayout } from '../../../lib/layout';
import { recipePhotoUri } from '../../../lib/media';
import { haptic } from '../../../services/haptics';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import {
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  RecipePhoto,
  Screen,
  Section,
  SyncIndicator,
  Text,
  useToast,
} from '../../../ui';

function greetingKey(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'home.morning' : h < 18 ? 'home.afternoon' : 'home.evening';
}

export default function Home() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rt = useRuntime();
  const repos = useRepos();
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

  const [community, setCommunity] = useState<PublicRecipeCard[]>([]);
  useEffect(() => {
    rt.api
      .publicRecipes({ sort: 'popular', limit: 10 })
      .then((r) => setCommunity(r.items))
      .catch(() => setCommunity([]));
  }, [rt.api]);

  const random = () => {
    const r = repos.randomRecipe();
    if (!r) return toast(t('home.randomEmpty'), { tone: 'info' });
    haptic.selection();
    router.push(`/recipe/${r.id}`);
  };

  const refresh = async () => {
    setRefreshing(true);
    rt.syncNow();
    await rt.session?.sync.sync();
    setRefreshing(false);
  };

  const name = rt.user?.displayName?.split(' ')[0] ?? '';
  const empty = data.library.length === 0;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} testID="home">
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
            {t(greetingKey(), { name })}
          </Text>
          <Text variant="hero" accessibilityRole="header">
            {t('home.question')}
          </Text>
        </View>
        {!layout.sidebar ? (
          <IconButton
            icon="person-circle-outline"
            label={t('tabs.profile')}
            onPress={() => router.push('/profile')}
            testID="open-profile"
          />
        ) : null}
      </View>
      <View style={{ gap: space.sm, marginTop: space.md }}>
        <SyncIndicator />
        {rt.user && !rt.user.emailVerified && rt.user.hasPassword ? <VerifyBanner /> : null}
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

        {community.length ? (
          <Section
            title={t('home.community')}
            action={t('common.seeAll')}
            onAction={() => router.push('/community')}
          >
            <View style={{ gap: space.sm }}>
              {community.slice(0, 5).map((c) => (
                <Card
                  key={c.id}
                  padded={false}
                  onPress={() => router.push(`/community/${c.id}`)}
                  accessibilityLabel={c.title}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: space.md,
                      padding: space.md,
                      alignItems: 'center',
                    }}
                  >
                    <RecipePhoto
                      uri={c.photoUrl}
                      category={(c.category as RecipeCategory) ?? null}
                      radius={radius.md}
                      style={{ width: 64, height: 64 }}
                      emojiSize={26}
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyStrong" numberOfLines={2}>
                        {c.title}
                      </Text>
                      <Text variant="caption" color="textMuted" numberOfLines={1}>
                        {t('recipe.byAuthor', { name: c.authorName })} ·{' '}
                        {t('community.saves', { count: c.saveCount })}
                      </Text>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          </Section>
        ) : null}
      </View>
    </Screen>
  );
}

function VerifyBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rt = useRuntime();
  const toast = useToast();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        borderRadius: radius.lg,
        backgroundColor: colors.accentSoft,
      }}
    >
      <Icon name="mail-unread-outline" size={20} color="accent" />
      <Text variant="callout" style={{ flex: 1 }}>
        {t('auth.verifyBanner')}
      </Text>
      <Button
        title={t('auth.resend')}
        variant="ghost"
        size="sm"
        onPress={async () => {
          try {
            await rt.api.resendVerification();
            toast(t('auth.resent'));
          } catch {
            toast(t('errors.network'), { tone: 'error' });
          }
        }}
      />
    </View>
  );
}
