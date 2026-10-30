import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Repos } from '@pepperedapron/client';
import {
  addDays,
  computeTotalMinutes,
  currentSeason,
  EMPTY_FILTERS,
  expiringSoon,
  leftoverIdeas,
  mealMoment,
  pickOfTheDay,
  recipeSeasons,
  searchRecipes,
  seasonalHighlights,
  toIsoDate,
  type RecipeCategory,
} from '@pepperedapron/core';
import type { Recipe } from '@pepperedapron/client';
import { TonightCard, type TonightReason } from '../../../features/home/Tonight';
import { CategoryGrid } from '../../../features/home/CategoryGrid';
import { RecipeCarousel } from '../../../features/home/Carousel';
import { useImportQueue } from '../../../hooks/importQueue';
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

/** Greeting and question for the moment of the day ("Une idée pour le goûter ?"). */
function greeting(t: TFunction, firstName: string | null, d = new Date()) {
  const m = mealMoment(d);
  const day = d.getDay();
  return {
    hello: firstName ? t(`delight.greet.${m}Name`, { name: firstName }) : t(`delight.greet.${m}`),
    question: t(`delight.greet.q_${m}`),
    // A word for the weekend, Friday and Monday; nothing the other days.
    flavor:
      day === 0 || day === 6
        ? t('delight.greet.weekend')
        : day === 5
          ? t('delight.greet.friday')
          : day === 1
            ? t('delight.greet.monday')
            : null,
  };
}

/**
 * Tonight's dinner if planned, or else the idea of the day: what needs finishing in the pantry,
 * then seasonal, favourite and long-forgotten recipes (one per day, stable through the day).
 * Also the produce in season and ideas for yesterday's leftovers.
 */
function tonightAndMore(
  r: Repos,
  library: Recipe[],
  favs: Recipe[],
  today: string,
  season: ReturnType<typeof currentSeason>,
  pantry: Recipe[],
) {
  const dinner = r
    .entries(today, today)
    .find((e) => e.data.slot === 'dinner' && e.data.recipeId && r.recipe(e.data.recipeId));
  let tonight: { recipe: Recipe; reason: TonightReason } | null = dinner
    ? { recipe: r.recipe(dinner.data.recipeId!)!, reason: 'planned' }
    : null;
  if (!tonight && library.length) {
    const stats = r.cookStats();
    const recent = (x: Recipe) => {
      const last = stats.get(x.id)?.last;
      return !!last && last >= addDays(today, -10);
    };
    const ranked: { recipe: Recipe; reason: TonightReason }[] = [];
    const add = (list: Recipe[], reason: TonightReason) => {
      for (const recipe of list)
        if (!recent(recipe) && !ranked.some((x) => x.recipe.id === recipe.id))
          ranked.push({ recipe, reason });
    };
    const mains = (list: Recipe[]) =>
      list.filter(
        (x) =>
          !x.data.category ||
          !['dessert', 'baking', 'drinks', 'breakfast', 'snack', 'sauce'].includes(x.data.category),
      );
    add(mains(pantry), 'pantry');
    add(mains(library.filter((x) => recipeSeasons(x.data).includes(season))), 'season');
    add(mains(favs), 'favorite');
    add(mains(r.forgottenRecipes(today)), 'forgotten');
    add(mains(library), 'any');
    tonight = pickOfTheDay(ranked, today, 4);
  }
  // Yesterday's dishes: what was cooked, and what was planned.
  const yesterday = addDays(today, -1);
  const eatenIds = new Set([
    ...r
      .allCookLogs()
      .filter((l) => l.data.date === yesterday)
      .map((l) => l.data.recipeId),
    ...r
      .entries(yesterday, yesterday)
      .map((e) => e.data.recipeId)
      .filter((x): x is string => !!x),
  ]);
  const asData = (x: Recipe) => ({
    id: x.id,
    title: x.data.title,
    ingredients: x.data.ingredients,
    record: x,
  });
  const eaten = [...eatenIds].map((id) => r.recipe(id)).filter((x): x is Recipe => !!x);
  return {
    tonight,
    highlights: seasonalHighlights(
      library.map((x) => ({ id: x.id, ingredients: x.data.ingredients })),
      season,
      2,
    ),
    leftovers: leftoverIdeas(eaten.map(asData), library.map(asData), 6)
      .slice(0, 1)
      .map((i) => ({ base: i.base, recipes: i.recipes.map((x) => x.record) })),
  };
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
  const season = currentSeason();
  const queue = useImportQueue();
  const importing = queue.jobs.filter(
    (j) => j.status === 'pending' || j.status === 'running',
  ).length;

  const data = useLive(
    ['recipe', 'favorite', 'mealPlanEntry', 'cookLog', 'pantryItem'],
    (r) => {
      const library = r.library();
      const favs = r.favoriteRecipes();
      // What expires within 3 days, and the recipes that use it (same ranking as "My fridge").
      const toUseSoon = () => {
        const soon = expiringSoon(
          r.pantryItems().map((p) => p.data),
          today,
          3,
        );
        const names = [...new Set(soon.map((p) => p.name))];
        return {
          soon: names,
          soonRecipes: names.length
            ? searchRecipes(r.searchable(library), '', { ...EMPTY_FILTERS, fridge: names })
                .slice(0, 12)
                .map((x) => x.recipe.record)
            : [],
        };
      };
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
        seasonal: library.filter((x) => recipeSeasons(x.data).includes(season)).slice(0, 12),
        forgotten: r.forgottenRecipes(today).slice(0, 12),
        ...toUseSoon(),
        todayMeals: r
          .entries(today, today)
          .map((e) => ({ entry: e, recipe: e.data.recipeId ? r.recipe(e.data.recipeId) : null })),
        counts,
        ...tonightAndMore(r, library, favs, today, season, toUseSoon().soonRecipes),
      };
    },
    [today, season],
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
  const hello = greeting(t, settings.firstName);
  // Tonight's planned dinner is already the big card.
  const todayOthers = data.todayMeals.filter(
    (m) =>
      !(
        data.tonight?.reason === 'planned' &&
        m.entry.data.slot === 'dinner' &&
        m.recipe?.id === data.tonight.recipe.id
      ),
  );
  const cardW =
    Math.min(
      layout.sidebar ? layout.width - 260 : layout.width,
      layout.contentMaxWidth + layout.gutter * 2,
    ) -
    layout.gutter * 2;
  const planTonight = async (recipe: Recipe) => {
    await repos.planMeal({ date: today, slot: 'dinner', recipeId: recipe.id });
    haptic.success();
    toast(t('delight.tonight.planned_ok'));
  };

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
            {hello.hello}
          </Text>
          <Text variant="hero" accessibilityRole="header">
            {hello.question}
          </Text>
          {hello.flavor ? (
            <Text variant="lede" color="textMuted">
              {hello.flavor}
            </Text>
          ) : null}
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
        {importing ? (
          <Card
            onPress={() => router.push('/import/queue')}
            accessibilityLabel={t('home.importsRunning', { count: importing })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Icon name="cloud-download-outline" size={24} color="primary" />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {t('home.importsRunning', { count: importing })}
              </Text>
              <Icon name="chevron-forward" size={18} color="textSubtle" />
            </View>
          </Card>
        ) : null}
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
            {data.tonight ? (
              <TonightCard
                recipe={data.tonight.recipe}
                reason={data.tonight.reason}
                width={cardW}
                onPlan={
                  data.tonight.reason === 'planned'
                    ? undefined
                    : () => void planTonight(data.tonight!.recipe)
                }
              />
            ) : null}
            {data.highlights.length ? (
              <View style={{ gap: space.sm }}>
                {data.highlights.map((h) => (
                  <Card
                    key={h.key}
                    onPress={() => router.push({ pathname: '/search', params: { q: h.label } })}
                    accessibilityLabel={`${t('delight.season.banner', { name: h.label })}, ${t('delight.season.count', { count: h.recipeIds.length })}`}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                      <Text style={{ fontSize: 28 }} maxFontSizeMultiplier={1}>
                        {seasonEmoji(season)}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyStrong">
                          {t('delight.season.banner', { name: h.label })}
                        </Text>
                        <Text variant="callout" color="textMuted">
                          {t('delight.season.count', { count: h.recipeIds.length })}
                        </Text>
                      </View>
                      <Icon name="chevron-forward" size={18} color="textSubtle" />
                    </View>
                  </Card>
                ))}
              </View>
            ) : null}
            {todayOthers.length || data.tonight?.reason !== 'planned' ? (
              <Section title={t('home.today')}>
                {todayOthers.length ? (
                  <View style={{ gap: space.sm }}>
                    {todayOthers.map(({ entry, recipe }) => (
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
            ) : null}

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

            {data.leftovers.length ? (
              <Section title={t('delight.leftovers.title')}>
                <Text variant="callout" color="textMuted">
                  {t('delight.leftovers.line', {
                    base: t(`delight.leftovers.base.${data.leftovers[0]!.base as 'rice'}`),
                  })}
                </Text>
                <RecipeCarousel
                  recipes={data.leftovers[0]!.recipes}
                  repos={repos}
                  favorites={data.favoriteIds}
                />
              </Section>
            ) : null}
            {data.soon.length ? (
              <Section
                title={t('home.useSoon')}
                action={t('pantry.title')}
                onAction={() => router.push('/pantry')}
              >
                <Text variant="callout" color="textMuted">
                  {data.soon.slice(0, 6).join(' · ')}
                </Text>
                {data.soonRecipes.length ? (
                  <RecipeCarousel
                    recipes={data.soonRecipes}
                    repos={repos}
                    favorites={data.favoriteIds}
                  />
                ) : null}
              </Section>
            ) : null}
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
            {data.seasonal.length ? (
              <Section
                title={`${t('home.seasonal')} · ${t(`seasons.${season}`)}`}
                action={t('common.seeAll')}
                onAction={() => router.push({ pathname: '/search', params: { season } })}
              >
                <RecipeCarousel
                  recipes={data.seasonal}
                  repos={repos}
                  favorites={data.favoriteIds}
                />
              </Section>
            ) : null}
            {data.forgotten.length ? (
              <Section title={t('home.forgotten')}>
                <RecipeCarousel
                  recipes={data.forgotten}
                  repos={repos}
                  favorites={data.favoriteIds}
                />
              </Section>
            ) : null}
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

function seasonEmoji(s: ReturnType<typeof currentSeason>): string {
  return { spring: '🌱', summer: '☀️', autumn: '🍂', winter: '❄️' }[s];
}
