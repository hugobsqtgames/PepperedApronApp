import { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { computeTotalMinutes, formatMinutes, type Locale, type Step } from '@pepperedapron/core';
import { IngredientList, SourceLink, StepList, TextBlock } from '../../../../features/recipe/RecipeBody';
import { useLive, useRepos, useRuntime } from '../../../../hooks/runtime';
import { errorMessage } from '../../../../lib/errors';
import { formatOven, recipeAsText } from '../../../../lib/format';
import { useLayout } from '../../../../lib/layout';
import { recipePhotoUri } from '../../../../lib/media';
import { track } from '../../../../services/analytics';
import { haptic } from '../../../../services/haptics';
import { timers } from '../../../../services/timers';
import { useTheme } from '../../../../theme/ThemeProvider';
import { radius, space } from '../../../../theme/tokens';
import { Badge, Button, EmptyState, IconButton, RecipePhoto, Screen, Section, Stepper, Text, useActionSheet, useToast } from '../../../../ui';

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const rt = useRuntime();
  const repos = useRepos();
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const sheet = useActionSheet();
  const locale = i18n.language as Locale;

  const { recipe, favorite, settings, collections } = useLive(['recipe', 'favorite', 'settings', 'collectionItem'], (r) => ({
    recipe: r.recipe(id),
    favorite: r.isFavorite(id),
    settings: r.settings(),
    collections: r.collectionsOf(id).length,
  }), [id]);
  const [servings, setServings] = useState<number | null>(null);
  useEffect(() => {
    if (recipe) track('recipe_viewed');
  }, [recipe?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!recipe) {
    return (
      <Screen scroll={false}>
        <EmptyState emoji="🍂" title={t('recipe.notFoundTitle')} body={t('recipe.notFoundBody')} action={t('common.back')} onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </Screen>
    );
  }

  const d = recipe.data;
  const editable = repos.canEdit(recipe);
  const mine = recipe.ownerId === rt.user?.id;
  const current = servings ?? d.servings;
  const factor = current / d.servings;
  const total = computeTotalMinutes(d);
  const photo = recipePhotoUri(recipe);

  const toggleFav = async () => {
    const now = await repos.toggleFavorite(recipe.id);
    haptic.light();
    if (now) track('favorite_added');
  };

  const addToShopping = async () => {
    try {
      const list = await repos.ensureActiveList(t('shopping.defaultName'));
      const res = await repos.addRecipeToList(list.id, recipe.id, current);
      haptic.success();
      toast(t('recipe.addedToShopping', { count: res.added + res.updated, list: list.data.name }), { action: { label: t('tabs.shopping'), onPress: () => router.push('/shopping') } });
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  const share = () =>
    sheet({
      title: t('recipe.share'),
      options: [
        {
          label: t('recipe.shareLink'),
          icon: 'link-outline',
          onPress: async () => {
            try {
              const { url } = await rt.api.shareRecipe(recipe.id);
              track('recipe_shared', { kind: 'link' });
              await Share.share({ message: `${t('recipe.shareMessage', { title: d.title })}\n${url}`, url });
            } catch (e) {
              toast(errorMessage(e, t), { tone: 'error' });
            }
          },
        },
        {
          label: t('recipe.shareText'),
          icon: 'document-text-outline',
          onPress: () => {
            track('recipe_shared', { kind: 'text' });
            void Share.share({
              message: recipeAsText(d, { ingredients: t('recipe.ingredients'), steps: t('recipe.steps'), tips: t('recipe.tips'), servings: t('common.servings', { count: d.servings }) }, locale, settings.unitSystem),
            });
          },
        },
      ],
    });

  const setVisibility = (visibility: 'public' | 'private') => {
    const apply = async () => {
      try {
        await repos.updateRecipe(recipe.id, { visibility });
        if (visibility === 'public') track('recipe_published');
        haptic.success();
      } catch (e) {
        toast(errorMessage(e, t), { tone: 'error' });
      }
    };
    if (visibility === 'private') return void apply();
    if (rt.user && !rt.user.emailVerified && rt.user.providers.length === 0) return toast(t('errors.publish_requires_verified_email'), { tone: 'error' });
    Alert.alert(t('recipe.makePublic'), t('recipe.makePublicBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), onPress: () => void apply() },
    ]);
  };

  const more = () =>
    sheet({
      title: d.title,
      options: [
        ...(editable ? [{ label: t('recipe.edit'), icon: 'create-outline' as const, onPress: () => router.push({ pathname: '/recipe/edit', params: { id: recipe.id } }) }] : []),
        { label: t('favorites.addTo'), icon: 'albums-outline' as const, onPress: () => router.push(`/recipe/${recipe.id}/collections`) },
        {
          label: t('recipe.duplicate'),
          icon: 'copy-outline' as const,
          onPress: async () => {
            const copy = await repos.duplicateRecipe(recipe.id, t('recipe.copySuffix'));
            router.push(`/recipe/${copy.id}`);
          },
        },
        ...(mine
          ? [
              d.visibility === 'public'
                ? { label: t('recipe.makePrivate'), icon: 'lock-closed-outline' as const, onPress: () => setVisibility('private') }
                : { label: t('recipe.makePublic'), icon: 'globe-outline' as const, onPress: () => setVisibility('public') },
              ...(rt.household
                ? [
                    {
                      label: d.householdId ? `✓ ${t('recipe.shareHousehold')}` : t('recipe.shareHousehold'),
                      icon: 'people-outline' as const,
                      onPress: () => void repos.updateRecipe(recipe.id, { householdId: d.householdId ? null : rt.household!.id }),
                    },
                  ]
                : []),
            ]
          : []),
        ...(!editable && d.visibility === 'public'
          ? [
              {
                label: t('recipe.saveToLibrary'),
                icon: 'download-outline' as const,
                onPress: async () => {
                  try {
                    const { record } = await rt.api.savePublicRecipe(recipe.id);
                    rt.syncNow();
                    toast(t('recipe.savedToLibrary'));
                    router.replace(`/recipe/${record.id}`);
                  } catch (e) {
                    toast(errorMessage(e, t), { tone: 'error' });
                  }
                },
              },
              { label: t('recipe.report'), icon: 'flag-outline' as const, onPress: () => router.push(`/community/${recipe.id}?report=1`) },
            ]
          : []),
        ...(editable && mine
          ? [
              {
                label: t('recipe.delete'),
                icon: 'trash-outline' as const,
                destructive: true,
                onPress: () =>
                  Alert.alert(t('recipe.deleteConfirm', { title: d.title }), t('recipe.deleteBody'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('common.delete'),
                      style: 'destructive',
                      onPress: async () => {
                        await repos.deleteRecipe(recipe.id);
                        haptic.warning();
                        toast(t('recipe.deleted'));
                        router.back();
                      },
                    },
                  ]),
              },
            ]
          : []),
      ],
    });

  const startTimer = (s: Step, i: number) => {
    if (!s.timerSeconds) return;
    track('timer_started');
    void timers.start({ label: s.timerLabel ?? `${d.title} — ${t('recipe.stepN', { n: i + 1 })}`, seconds: s.timerSeconds, recipeId: recipe.id, stepIndex: i });
    toast(t('recipe.timer', { time: `${Math.round(s.timerSeconds / 60)} min` }), { tone: 'info' });
  };

  const meta = [
    d.prepMinutes ? `${t('recipe.prep')} ${formatMinutes(d.prepMinutes, locale)}` : null,
    d.cookMinutes ? `${t('recipe.cook')} ${formatMinutes(d.cookMinutes, locale)}` : null,
    d.restMinutes ? `${t('recipe.rest')} ${formatMinutes(d.restMinutes, locale)}` : null,
  ].filter(Boolean) as string[];

  const header = (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {total ? <Badge icon="time-outline" label={formatMinutes(total, locale)} tone="primary" /> : null}
        {d.difficulty ? <Badge label={t(`difficulty.${d.difficulty}`)} /> : null}
        {d.category ? <Badge label={t(`categories.${d.category}`)} /> : null}
        {d.seasons.map((s) => <Badge key={s} label={t(`seasons.${s}`)} tone="accent" />)}
        {d.ovenTemperatureC ? <Badge icon="flame-outline" label={t('recipe.oven', { temp: formatOven(d.ovenTemperatureC, settings.unitSystem) })} /> : null}
        {d.visibility === 'public' ? <Badge icon="globe-outline" label={t('recipe.public')} tone="primary" /> : null}
        {d.householdId ? <Badge icon="people-outline" label={t('household.title')} /> : null}
        {!mine && !d.householdId ? <Badge icon="globe-outline" label={t('community.title')} tone="accent" /> : null}
        {collections ? <Badge icon="albums-outline" label={String(collections)} /> : null}
      </View>
      <Text variant="hero" accessibilityRole="header" testID="recipe-title">
        {d.title}
      </Text>
      {d.description ? <Text color="textMuted">{d.description}</Text> : null}
      {meta.length ? (
        <Text variant="callout" color="textMuted">
          {meta.join('  ·  ')}
        </Text>
      ) : null}
      {recipe.state === 'error' ? (
        <Text variant="callout" color="danger">
          {t('sync.itemError')}: {recipe.error?.startsWith('publish') ? t('errors.publish_requires_verified_email') : t('errors.invalidField')}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <IconButton icon={favorite ? 'heart' : 'heart-outline'} label={favorite ? t('recipe.unfavorite') : t('recipe.favorite')} onPress={toggleFav} color={favorite ? colors.accent : undefined} testID="recipe-favorite" />
        <IconButton icon="calendar-outline" label={t('recipe.addToPlan')} onPress={() => router.push({ pathname: '/plan/pick', params: { recipeId: recipe.id } })} />
        <IconButton icon="cart-outline" label={t('recipe.addToShopping')} onPress={() => void addToShopping()} testID="recipe-add-shopping" />
        <IconButton icon="share-outline" label={t('recipe.share')} onPress={share} />
        <IconButton icon="ellipsis-horizontal" label={t('common.more')} onPress={more} testID="recipe-more" />
      </View>
    </View>
  );

  const ingredients = (
    <Section title={t('recipe.ingredients')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Text variant="callout" color="textMuted">
          {t('recipe.servingsFor')}
        </Text>
        <Stepper value={current} onChange={setServings} label={t('recipe.scale')} testID="servings-stepper" />
        <Text variant="callout" color="textMuted">
          {d.yieldLabel ?? t('recipe.people', { count: current })}
        </Text>
      </View>
      <IngredientList ingredients={d.ingredients} factor={factor} system={settings.unitSystem} />
    </Section>
  );

  const steps = (
    <Section title={t('recipe.steps')}>
      <StepList steps={d.steps} onTimer={startTimer} />
    </Section>
  );

  const extras = (
    <View style={{ gap: space.md }}>
      <TextBlock title={t('recipe.tips')} text={d.tips} icon="bulb-outline" />
      <TextBlock title={t('recipe.notes')} text={d.notes} icon="document-text-outline" />
      <TextBlock title={t('recipe.info')} text={d.extraInfo} icon="information-circle-outline" />
      <SourceLink source={d.source} url={d.sourceUrl} />
      {d.tags.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {d.tags.map((tag) => <Badge key={tag} label={`#${tag}`} />)}
        </View>
      ) : null}
    </View>
  );

  const hero = photo || layout.isTablet ? (
    <RecipePhoto uri={photo} category={d.category} radius={layout.sidebar ? radius.xxl : 0} style={{ width: '100%', aspectRatio: layout.sidebar ? 16 / 10 : 4 / 3 }} emojiSize={72} recyclingKey={recipe.id} />
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen edges={[]} padded={false} maxWidth={layout.wide ? 1200 : undefined}>
        {!layout.sidebar ? hero : <View style={{ height: insets.top + space.xxl }} />}
        <View style={{ paddingHorizontal: layout.gutter, paddingTop: space.xl, gap: space.xxl }}>
          {layout.wide ? (
            <View style={{ flexDirection: 'row', gap: space.xxxl, alignItems: 'flex-start' }}>
              <View style={{ flex: 5, gap: space.xxl }}>
                {hero}
                {header}
                {ingredients}
              </View>
              <View style={{ flex: 6, gap: space.xxl }}>
                {steps}
                {extras}
              </View>
            </View>
          ) : (
            <>
              {layout.sidebar ? hero : null}
              {header}
              {ingredients}
              {steps}
              {extras}
            </>
          )}
        </View>
      </Screen>
      <View style={[styles.back, { top: insets.top + space.sm }]}>
        <IconButton icon="chevron-back" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} variant={photo && !layout.sidebar ? 'overlay' : 'surface'} />
      </View>
      {d.steps.length ? (
        <View style={[styles.cta, { paddingBottom: insets.bottom + space.md, backgroundColor: colors.background, borderTopColor: colors.line }]}>
          <Button title={t('recipe.startCooking')} icon="play" size="lg" full onPress={() => router.push(`/recipe/${recipe.id}/cook`)} style={{ maxWidth: 520, alignSelf: 'center', width: '100%' }} testID="start-cooking" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { position: 'absolute', left: space.lg },
  cta: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
