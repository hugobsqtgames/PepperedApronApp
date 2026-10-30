import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  computeTotalMinutes,
  detectSeasons,
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
import { errorMessage } from '../../../../lib/errors';
import { formatOven, recipeAsText } from '../../../../lib/format';
import { useLayout } from '../../../../lib/layout';
import { photoUri, recipePhotoUri } from '../../../../lib/media';
import { printRecipes, shareRecipesPdf } from '../../../../lib/print';
import { ShareModal } from '../../../../features/share/ShareModal';
import { pickImage, preparePhoto, type PhotoSource } from '../../../../services/photos';
import { clearActivity, setActivity } from '../../../../../modules/ios-integration';
import { haptic } from '../../../../services/haptics';
import { timers } from '../../../../services/timers';
import { useTheme } from '../../../../theme/ThemeProvider';
import { radius, space } from '../../../../theme/tokens';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
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

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
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
      onSubmit: (v) => void repos.setPersonalNote(recipe.id, v || null),
    });

  const cookedToday = async () => {
    await repos.logCooked(recipe.id);
    haptic.success();
    toast(t('history.logged'));
  };

  const history = () =>
    sheet({
      title: t('history.title'),
      message: t('history.removeHint'),
      options: cooked.map((c) => ({
        label: dayMonth(c.data.date, i18n.language),
        icon: 'trash-outline' as const,
        destructive: true,
        onPress: () => void repos.removeCookLog(c.id),
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
      const log = await repos.logCooked(recipe.id);
      await repos.setCookPhoto(log.id, key);
      haptic.success();
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
      <Text variant="hero" accessibilityRole="header" testID="recipe-title">
        {d.title}
      </Text>
      {d.description ? <Text color="textMuted">{d.description}</Text> : null}
      {meta.length ? (
        <Text variant="callout" color="textMuted">
          {meta.join('  ·  ')}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
        <Stars value={d.rating} onChange={(v) => void repos.setRating(recipe.id, v)} />
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
        factor={factor}
        ingredients={d.ingredients}
        system={settings.unitSystem}
      />
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
        <Text variant="body" color={d.personalNote ? 'text' : 'textMuted'}>
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
                    onLongPress={() =>
                      sheet({
                        title: dayMonth(c.data.date, i18n.language),
                        options: [
                          {
                            label: t('editor.removePhoto'),
                            icon: 'trash-outline',
                            destructive: true,
                            onPress: () => void repos.setCookPhoto(c.id, null),
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

  const hero =
    photo || layout.isTablet ? (
      <RecipePhoto
        uri={photo}
        category={d.category}
        radius={layout.sidebar ? radius.xxl : 0}
        style={{ width: '100%', aspectRatio: layout.sidebar ? 16 / 10 : 4 / 3 }}
        emojiSize={72}
        recyclingKey={recipe.id}
      />
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
          variant={photo && !layout.sidebar ? 'overlay' : 'surface'}
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
