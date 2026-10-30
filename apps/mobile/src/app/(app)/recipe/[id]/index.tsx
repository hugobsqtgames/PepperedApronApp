import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  computeTotalMinutes,
  CUISINE_COUNTRY,
  CUISINES,
  detectSeasons,
  flagOf,
  pairingsFor,
  recipeCuisine,
  dietTags,
  findMoldSize,
  formatMinutes,
  scaleMold,
  type Locale,
  type MoldSize,
  type Step,
} from '@pepperedapron/core';
import { noticeText, WARNING_NOTICES } from '../../../../features/recipe/notices';
import { dayMonth } from '../../../../lib/dates';
import {
  IngredientList,
  SourceLink,
  StepList,
  TextBlock,
} from '../../../../features/recipe/RecipeBody';
import { useLive, useRepos } from '../../../../hooks/runtime';
import { errorMessage, inBackground } from '../../../../lib/errors';
import { formatOven, recipeAsText } from '../../../../lib/format';
import { useLayout } from '../../../../lib/layout';
import { photoUri, recipePhotoUri } from '../../../../lib/media';
import { printRecipes, shareRecipesPdf } from '../../../../lib/print';
import { ShareModal } from '../../../../features/share/ShareModal';
import { pickImage, preparePhoto, type PhotoSource } from '../../../../services/photos';
import { clearActivity, setActivity } from '../../../../../modules/ios-integration';
import { haptic } from '../../../../services/haptics';
import { timers } from '../../../../services/timers';
import { TintScope, useTheme } from '../../../../theme/ThemeProvider';
import { useDishColor } from '../../../../lib/photoTint';
import { useCookCelebration } from '../../../../features/celebrate';
import { radius, space } from '../../../../theme/tokens';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  type IconName,
  longPressActions,
  RecipePhoto,
  Screen,
  Section,
  Stars,
  Stepper,
  Text,
  useActionSheet,
  usePrompt,
  useToast,
} from '../../../../ui';

function moldLabel(m: MoldSize): string {
  return m.shape === 'round' ? `Ø ${m.diameter} cm` : `${m.width} × ${m.length} cm`;
}

/** The page takes on the colour of the dish (its photo, or its category's). */
export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const look = useLive(
    ['recipe'],
    (r) => {
      const x = r.recipe(id);
      return x ? { uri: recipePhotoUri(x), category: x.data.category } : null;
    },
    [id],
  );
  const color = useDishColor(look?.uri ?? null, look?.category ?? null);
  return (
    <TintScope color={color}>
      <RecipeDetailBody id={id} />
    </TintScope>
  );
}

function RecipeDetailBody({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const { colors, a11y } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const scrollY = useRef(new Animated.Value(0)).current;
  const celebrate = useCookCelebration();
  const repos = useRepos();
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const sheet = useActionSheet();
  const prompt = usePrompt();
  const locale = i18n.language as Locale;

  const { recipe, favorite, settings, collections, cooked } = useLive(
    ['recipe', 'favorite', 'settings', 'collectionItem', 'cookLog'],
    (r) => ({
      recipe: r.recipe(id),
      favorite: r.isFavorite(id),
      settings: r.settings(),
      collections: r.collectionsOf(id).length,
      cooked: r.cookLogs(id),
    }),
    [id],
  );
  const [servings, setServings] = useState<number | null>(null);
  const [shareMode, setShareMode] = useState<'card' | 'qr' | null>(null);
  // Handoff: this recipe can be continued on the user's other iPhone or iPad.
  const handoffTitle = recipe?.data.title;
  useEffect(() => {
    if (!handoffTitle) return;
    setActivity('recipe', handoffTitle, `pepperedapron://recipe/${id}`);
    return () => clearActivity();
  }, [id, handoffTitle]);

  if (!recipe) {
    return (
      <Screen scroll={false}>
        <EmptyState
          emoji="🍂"
          title={t('recipe.notFoundTitle')}
          body={t('recipe.notFoundBody')}
          action={t('common.back')}
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </Screen>
    );
  }

  const d = recipe.data;
  const current = servings ?? d.servings;
  const factor = current / d.servings;
  const total = computeTotalMinutes(d);
  const photo = recipePhotoUri(recipe);
  // Phones: the photo fills the top of the screen, the title written on it.
  const bigHeader = !layout.sidebar;
  const heroH = Math.min(Math.round(winH * 0.56), 560);
  const names = d.ingredients.map((i) => i.name);
  const diets = dietTags(names);
  const seasons = d.seasons.length ? d.seasons : detectSeasons(names);
  const mold = findMoldSize([
    d.yieldLabel,
    ...d.ingredients.flatMap((i) => [i.name, i.note]),
    ...d.steps.map((s) => s.text),
    d.notes,
    d.tips,
    d.extraInfo,
  ]);
  const scaledMold = mold ? scaleMold(mold, factor) : null;
  // Another copy of this recipe in the library (same link, or same title and ingredients).
  const duplicate = repos.findDuplicate(
    { title: d.title, sourceUrl: d.sourceUrl, ingredientNames: names },
    recipe.id,
  );

  const editNote = () =>
    prompt({
      title: t('recipe.personalNote'),
      message: t('recipe.personalNoteHint'),
      initial: d.personalNote ?? '',
      multiline: true,
      maxLength: 2000,
      allowEmpty: true,
      onSubmit: (v) => inBackground(repos.setPersonalNote(recipe.id, v || null)),
    });

  const cookedToday = async () => {
    await celebrate(() => repos.logCooked(recipe.id));
    toast(t('history.logged'));
  };

  const cuisine = recipeCuisine(d);
  const chooseCuisine = () =>
    sheet({
      title: t('delight.cuisineChoose'),
      options: [
        {
          label: t('delight.cuisineAuto'),
          icon: 'sparkles-outline' as const,
          onPress: () => inBackground(repos.setCuisine(recipe.id, null)),
        },
        ...CUISINES.map((c) => ({
          label: `${flagOf(CUISINE_COUNTRY[c])}  ${t(`delight.cuisines.${c}`)}`,
          onPress: () => inBackground(repos.setCuisine(recipe.id, c)),
        })),
      ],
    });
  const pairing = pairingsFor({
    title: d.title,
    category: d.category,
    cuisine,
    ingredients: d.ingredients,
  });

  const editStepNote = (s: Step, i: number) =>
    prompt({
      title: t('delight.stepNoteTitle', { n: i + 1 }),
      message: t('delight.stepNoteHint'),
      initial: d.stepNotes[s.id] ?? '',
      multiline: true,
      maxLength: 500,
      allowEmpty: true,
      onSubmit: (v) => inBackground(repos.setStepNote(recipe.id, s.id, v || null)),
    });

  const history = () =>
    sheet({
      title: t('history.title'),
      message: t('history.removeHint'),
      options: cooked.map((c) => ({
        label: dayMonth(c.data.date, i18n.language),
        icon: 'trash-outline' as const,
        destructive: true,
        onPress: () => inBackground(repos.removeCookLog(c.id)),
      })),
    });

  const toggleFav = async () => {
    await repos.toggleFavorite(recipe.id);
    haptic.light();
  };

  const addToShopping = async () => {
    try {
      const list = await repos.ensureActiveList(t('shopping.defaultName'));
      const res = await repos.addRecipeToList(list.id, recipe.id, current);
      haptic.success();
      toast(t('recipe.addedToShopping', { count: res.added + res.updated, list: list.data.name }), {
        action: { label: t('tabs.shopping'), onPress: () => router.push('/shopping') },
      });
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  /** "My result": a photo of the dish as it came out, on today's entry of the history. */
  const addResultPhoto = (source: PhotoSource) => async () => {
    try {
      const r = await pickImage(source);
      if (!r || 'denied' in r) {
        if (r)
          toast(t(source === 'camera' ? 'errors.cameraPermission' : 'errors.photoPermission'), {
            tone: 'error',
          });
        return;
      }
      const key = await preparePhoto(r.uri);
      await celebrate(async () => {
        const log = await repos.logCooked(recipe.id);
        await repos.setCookPhoto(log.id, key);
      });
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };
  const resultPhoto = () =>
    sheet({
      title: t('history.resultPhoto'),
      message: t('history.resultPhotoHint'),
      options: [
        {
          label: t('editor.takePhoto'),
          icon: 'camera-outline',
          onPress: () => void addResultPhoto('camera')(),
        },
        {
          label: t('editor.chooseLibrary'),
          icon: 'images-outline',
          onPress: () => void addResultPhoto('library')(),
        },
      ],
    });
  const results = cooked.filter((c) => c.data.photoKey);

  /** Several ways to share: text for any app, an image, a QR code, paper or PDF. */
  const share = () =>
    sheet({
      title: t('recipe.share'),
      options: [
        { label: t('share.asText'), icon: 'chatbubble-outline', onPress: shareText },
        { label: t('share.asImage'), icon: 'image-outline', onPress: () => setShareMode('card') },
        { label: t('share.asQr'), icon: 'qr-code-outline', onPress: () => setShareMode('qr') },
        {
          label: t('share.print'),
          icon: 'print-outline',
          onPress: () => void printRecipes([recipe], settings.unitSystem).catch(() => undefined),
        },
        {
          label: t('share.pdf'),
          icon: 'document-outline',
          onPress: () => void shareRecipesPdf([recipe], settings.unitSystem).catch(() => undefined),
        },
      ],
    });

  /** Plain text: readable in any app (Messages, WhatsApp, Notes…), no account needed. */
  const shareText = () =>
    void Share.share({
      message: recipeAsText(
        d,
        {
          ingredients: t('recipe.ingredients'),
          steps: t('recipe.steps'),
          tips: t('recipe.tips'),
          servings: t('common.servings', { count: d.servings }),
        },
        locale,
        settings.unitSystem,
      ),
    });

  const more = () =>
    sheet({
      title: d.title,
      options: [
        {
          label: t('recipe.edit'),
          icon: 'create-outline' as const,
          onPress: () => router.push({ pathname: '/recipe/edit', params: { id: recipe.id } }),
        },
        {
          label: t('favorites.addTo'),
          icon: 'albums-outline' as const,
          onPress: () => router.push(`/recipe/${recipe.id}/collections`),
        },
        ...(duplicate
          ? [
              {
                label: t('merge.action'),
                icon: 'git-merge-outline' as const,
                onPress: () =>
                  router.push({
                    pathname: '/recipe/merge',
                    params: { keep: recipe.id, drop: duplicate.id },
                  }),
              },
            ]
          : []),
        {
          label: t('recipe.duplicate'),
          icon: 'copy-outline' as const,
          onPress: async () => {
            const copy = await repos.duplicateRecipe(recipe.id, t('recipe.copySuffix'));
            router.push(`/recipe/${copy.id}`);
          },
        },
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
      ],
    });

  const startTimer = (s: Step, i: number, seconds: number) => {
    void timers.start({
      label: s.timerLabel ?? `${d.title} — ${t('recipe.stepN', { n: i + 1 })}`,
      seconds,
      recipeId: recipe.id,
      stepIndex: i,
    });
    toast(t('recipe.timer', { time: `${Math.round(seconds / 60)} min` }), { tone: 'info' });
  };

  const meta = [
    d.prepMinutes ? `${t('recipe.prep')} ${formatMinutes(d.prepMinutes, locale)}` : null,
    d.cookMinutes ? `${t('recipe.cook')} ${formatMinutes(d.cookMinutes, locale)}` : null,
    d.restMinutes ? `${t('recipe.rest')} ${formatMinutes(d.restMinutes, locale)}` : null,
  ].filter(Boolean) as string[];

  const header = (
    <View style={{ gap: space.md }}>
      {d.review ? (
        <View
          style={[
            styles.review,
            {
              backgroundColor: WARNING_NOTICES.has(d.review)
                ? colors.accentSoft
                : colors.primarySoft,
            },
          ]}
          testID="recipe-review"
        >
          <Text variant="bodyStrong">{t('recipe.reviewTitle')}</Text>
          <Text variant="callout">{noticeText(d.review, t)}</Text>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Button
              title={t('recipe.edit')}
              icon="create-outline"
              size="sm"
              onPress={() => router.push({ pathname: '/recipe/edit', params: { id: recipe.id } })}
            />
            <Button
              title={t('recipe.reviewOk')}
              icon="checkmark"
              size="sm"
              variant="secondary"
              onPress={() => repos.dismissReview(recipe.id)}
              testID="recipe-review-ok"
            />
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {total ? (
          <Badge icon="time-outline" label={formatMinutes(total, locale)} tone="primary" />
        ) : null}
        {d.difficulty ? <Badge label={t(`difficulty.${d.difficulty}`)} /> : null}
        {d.category ? <Badge label={t(`categories.${d.category}`)} /> : null}
        <Badge
          label={
            cuisine
              ? `${flagOf(CUISINE_COUNTRY[cuisine])} ${t(`delight.cuisines.${cuisine}`)}`
              : `🌍 ${t('delight.cuisine')}`
          }
          onPress={chooseCuisine}
          accessibilityHint={t('delight.cuisineHint')}
          testID="recipe-cuisine"
        />
        {seasons.map((s) => (
          <Badge key={s} label={t(`seasons.${s}`)} tone="accent" />
        ))}
        {diets.map((x) => (
          <Badge key={x} icon="leaf-outline" label={t(`diets.${x}`)} tone="primary" />
        ))}
        {d.ovenTemperatureC ? (
          <Badge
            icon="flame-outline"
            label={t('recipe.oven', { temp: formatOven(d.ovenTemperatureC, settings.unitSystem) })}
          />
        ) : null}
        {collections ? <Badge icon="albums-outline" label={String(collections)} /> : null}
      </View>
      {bigHeader ? null : (
        <Text variant="hero" accessibilityRole="header" testID="recipe-title">
          {d.title}
        </Text>
      )}
      {d.description ? (
        <Text variant="lede" color="textMuted">
          {d.description}
        </Text>
      ) : null}
      {meta.length ? (
        <Text variant="callout" color="textMuted">
          {meta.join('  ·  ')}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
        <Stars value={d.rating} onChange={(v) => inBackground(repos.setRating(recipe.id, v))} />
        {cooked.length ? (
          <Text
            variant="caption"
            color="textMuted"
            onPress={history}
            accessibilityRole="button"
            style={{ flexShrink: 1 }}
          >
            {t('history.summary', {
              count: cooked.length,
              date: dayMonth(cooked[0]!.data.date, i18n.language),
            })}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <IconButton
          icon={favorite ? 'heart' : 'heart-outline'}
          label={favorite ? t('recipe.unfavorite') : t('recipe.favorite')}
          onPress={toggleFav}
          color={favorite ? colors.accent : undefined}
          testID="recipe-favorite"
        />
        <IconButton
          icon="calendar-outline"
          label={t('recipe.addToPlan')}
          onPress={() => router.push({ pathname: '/plan/pick', params: { recipeId: recipe.id } })}
          testID="recipe-plan"
        />
        <IconButton
          icon="cart-outline"
          label={t('recipe.addToShopping')}
          onPress={() => void addToShopping()}
          testID="recipe-add-shopping"
        />
        <IconButton icon="share-outline" label={t('recipe.share')} onPress={share} />
        <IconButton
          icon="ellipsis-horizontal"
          label={t('common.more')}
          onPress={more}
          testID="recipe-more"
        />
      </View>
    </View>
  );

  const ingredients = (
    <Section title={t('recipe.ingredients')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Text variant="callout" color="textMuted">
          {t('recipe.servingsFor')}
        </Text>
        <Stepper
          value={current}
          onChange={setServings}
          label={t('recipe.scale')}
          testID="servings-stepper"
        />
        <Text variant="callout" color="textMuted">
          {d.yieldLabel ?? t('recipe.people', { count: current })}
        </Text>
      </View>
      {scaledMold && mold ? (
        <View style={[styles.hint, { backgroundColor: colors.primarySoft }]}>
          <Icon name="resize-outline" size={18} color="primary" />
          <Text variant="callout" style={{ flex: 1 }}>
            {t('recipe.moldHint', { size: moldLabel(scaledMold), original: moldLabel(mold) })}
          </Text>
        </View>
      ) : null}
      <IngredientList ingredients={d.ingredients} factor={factor} system={settings.unitSystem} />
      <Button
        title={t('converter.open')}
        icon="swap-horizontal-outline"
        variant="ghost"
        size="sm"
        onPress={() => router.push('/tools/converter')}
        style={{ alignSelf: 'flex-start' }}
      />
    </Section>
  );

  const steps = (
    <Section title={t('recipe.steps')}>
      <StepList
        steps={d.steps}
        onTimer={startTimer}
        notes={d.stepNotes}
        onNote={editStepNote}
        factor={factor}
        ingredients={d.ingredients}
        system={settings.unitSystem}
      />
    </Section>
  );

  const pairings = (
    <Section title={t('delight.pairing.title')} kicker={t('delight.pairing.kicker')}>
      <View style={[styles.pairing, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        {(
          [
            pairing.drink
              ? ['wine-outline', 'drink', t(`delight.pairing.drinks.${pairing.drink}`)]
              : null,
            ['cafe-outline', 'soft', t(`delight.pairing.drinks.${pairing.soft}`)],
            pairing.side
              ? ['restaurant-outline', 'side', t(`delight.pairing.sides.${pairing.side}`)]
              : null,
          ].filter(Boolean) as [IconName, 'drink' | 'soft' | 'side', string][]
        ).map(([icon, kind, text]) => (
          <View
            key={kind}
            style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}
          >
            <Icon name={icon} size={20} color="accent" />
            <View style={{ flex: 1 }}>
              <Text variant="kicker" color="textMuted">
                {t(`delight.pairing.${kind}`)}
              </Text>
              <Text variant="callout">{text}</Text>
            </View>
          </View>
        ))}
      </View>
    </Section>
  );

  const extras = (
    <View style={{ gap: space.md }}>
      <Pressable
        accessibilityRole="button"
        onPress={editNote}
        style={[styles.note, { borderColor: colors.line, backgroundColor: colors.surface }]}
        testID="recipe-personal-note"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name="create-outline" size={18} color="primary" />
          <Text variant="title3" style={{ flex: 1 }}>
            {t('recipe.personalNote')}
          </Text>
        </View>
        <Text
          variant={d.personalNote ? 'quote' : 'body'}
          color={d.personalNote ? 'text' : 'textMuted'}
        >
          {d.personalNote ?? t('recipe.personalNoteEmpty')}
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button
          title={t('history.cookedToday')}
          icon="checkmark-done-outline"
          variant="secondary"
          onPress={cookedToday}
          style={{ flex: 1 }}
          testID="recipe-cooked"
        />
        <IconButton icon="camera-outline" label={t('history.resultPhoto')} onPress={resultPhoto} />
      </View>
      {results.length ? (
        <View style={{ gap: space.sm }}>
          <Text variant="caption" color="textMuted" weight="600">
            {t('history.results')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {results.map((c) => {
                const uri = photoUri(c.data.photoKey);
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityLabel={t('history.resultOn', {
                      date: dayMonth(c.data.date, i18n.language),
                    })}
                    {...longPressActions(t('editor.removePhoto'), () =>
                      inBackground(repos.setCookPhoto(c.id, null)),
                    )}
                    onLongPress={() =>
                      sheet({
                        title: dayMonth(c.data.date, i18n.language),
                        options: [
                          {
                            label: t('editor.removePhoto'),
                            icon: 'trash-outline',
                            destructive: true,
                            onPress: () => inBackground(repos.setCookPhoto(c.id, null)),
                          },
                        ],
                      })
                    }
                    style={{ gap: 4 }}
                  >
                    {uri ? (
                      <Image
                        source={{ uri }}
                        style={{ width: 112, height: 112, borderRadius: radius.lg }}
                        contentFit="cover"
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <View
                        style={{
                          width: 112,
                          height: 112,
                          borderRadius: radius.lg,
                          backgroundColor: colors.surfaceMuted,
                        }}
                      />
                    )}
                    <Text variant="caption" color="textMuted">
                      {dayMonth(c.data.date, i18n.language)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}
      <TextBlock title={t('recipe.tips')} text={d.tips} icon="bulb-outline" />
      <TextBlock title={t('recipe.notes')} text={d.notes} icon="document-text-outline" />
      <TextBlock title={t('recipe.info')} text={d.extraInfo} icon="information-circle-outline" />
      <SourceLink source={d.source} url={d.sourceUrl} />
      {d.tags.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {d.tags.map((tag) => (
            <Badge key={tag} label={`#${tag}`} />
          ))}
        </View>
      ) : null}
    </View>
  );

  // iPad columns: the photo in the left column, as before.
  const hero = layout.sidebar ? (
    <Link.AppleZoomTarget>
      <RecipePhoto
        uri={photo}
        category={d.category}
        radius={radius.xxl}
        style={{ width: '100%', aspectRatio: 16 / 10 }}
        emojiSize={72}
        recyclingKey={recipe.id}
      />
    </Link.AppleZoomTarget>
  ) : null;

  const kicker = [
    d.category ? t(`categories.${d.category}`) : null,
    cuisine ? `${flagOf(CUISINE_COUNTRY[cuisine])} ${t(`delight.cuisines.${cuisine}`)}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  // The photo moves slower than the page, and stretches when pulled down.
  const still = a11y.reduceMotion;
  const bigHero = (
    <View style={{ height: heroH, backgroundColor: colors.surfaceMuted }} testID="recipe-hero">
      <Animated.View
        style={[
          { position: 'absolute', top: 0, left: 0, width: winW, height: heroH },
          still
            ? null
            : {
                transform: [
                  {
                    translateY: scrollY.interpolate({
                      inputRange: [-heroH, 0, heroH],
                      outputRange: [-heroH / 2, 0, heroH * 0.35],
                      extrapolate: 'clamp',
                    }),
                  },
                  {
                    scale: scrollY.interpolate({
                      inputRange: [-heroH, 0, 1],
                      outputRange: [2, 1, 1],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
        ]}
      >
        <Link.AppleZoomTarget>
          <RecipePhoto
            uri={photo}
            category={d.category}
            radius={0}
            style={{ width: winW, height: heroH }}
            emojiSize={96}
            recyclingKey={recipe.id}
          />
        </Link.AppleZoomTarget>
      </Animated.View>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(8,12,10,0.82)']}
        locations={[0, 0.22, 0.45, 1]}
        style={{ position: 'absolute', top: 0, left: 0, width: winW, height: heroH }}
      />
      <View style={[styles.heroText, { left: layout.gutter, right: layout.gutter }]}>
        {kicker ? (
          <Text variant="kicker" style={{ color: 'rgba(255,252,246,0.92)' }}>
            {kicker}
          </Text>
        ) : null}
        <Text
          variant="hero"
          accessibilityRole="header"
          testID="recipe-title"
          numberOfLines={4}
          style={{ color: '#FFFCF6', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 12 }}
        >
          {d.title}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Animated.ScrollView
        testID="recipe-scroll"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        contentContainerStyle={{ paddingBottom: space.huge * 2 + 72 }}
      >
        {bigHeader ? bigHero : <View style={{ height: insets.top + space.xxl }} />}
        <View
          style={{
            width: '100%',
            maxWidth: layout.wide ? 1200 : layout.contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: layout.gutter,
            paddingTop: space.xl,
            gap: space.xxl,
          }}
        >
          {layout.wide ? (
            <View style={{ flexDirection: 'row', gap: space.xxxl, alignItems: 'flex-start' }}>
              <View style={{ flex: 5, gap: space.xxl }}>
                {hero}
                {header}
                {ingredients}
              </View>
              <View style={{ flex: 6, gap: space.xxl }}>
                {steps}
                {pairings}
                {extras}
              </View>
            </View>
          ) : (
            <>
              {layout.sidebar ? hero : null}
              {header}
              {ingredients}
              {steps}
              {pairings}
              {extras}
            </>
          )}
        </View>
      </Animated.ScrollView>
      {bigHeader ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.topBar,
            {
              height: insets.top + 52,
              paddingTop: insets.top,
              backgroundColor: colors.background,
              borderBottomColor: colors.line,
              opacity: scrollY.interpolate({
                inputRange: [heroH - insets.top - 110, heroH - insets.top - 50],
                outputRange: [0, 1],
                extrapolate: 'clamp',
              }),
            },
          ]}
        >
          <Text
            variant="title3"
            numberOfLines={1}
            style={{ marginHorizontal: 72, textAlign: 'center' }}
          >
            {d.title}
          </Text>
        </Animated.View>
      ) : null}
      <ShareModal
        recipe={recipe}
        mode={shareMode}
        system={settings.unitSystem}
        onClose={() => setShareMode(null)}
      />
      <View style={[styles.back, { top: insets.top + space.sm }]}>
        <IconButton
          icon="chevron-back"
          label={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          variant={bigHeader ? 'overlay' : 'surface'}
        />
      </View>
      {d.steps.length ? (
        <View
          style={[
            styles.cta,
            {
              paddingBottom: insets.bottom + space.md,
              backgroundColor: colors.background,
              borderTopColor: colors.line,
            },
          ]}
        >
          <Button
            title={t('recipe.startCooking')}
            icon="play"
            size="lg"
            full
            onPress={() =>
              router.push({
                pathname: '/recipe/[id]/cook',
                params: { id: recipe.id, servings: String(current) },
              })
            }
            style={{ maxWidth: 520, alignSelf: 'center', width: '100%' }}
            testID="start-cooking"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { position: 'absolute', left: space.lg },
  heroText: { position: 'absolute', bottom: space.xl, gap: space.xs },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pairing: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  review: { gap: space.sm, padding: space.lg, borderRadius: radius.xl },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
  },
  note: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cta: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
