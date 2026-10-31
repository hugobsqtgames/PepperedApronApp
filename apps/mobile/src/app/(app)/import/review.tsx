import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  parseIngredientLine,
  parseTimerSeconds,
  uuidv7,
  type Ingredient,
  type Locale,
  type Step,
} from '@pepperedapron/core';
import { useLive, useRepos } from '../../../hooks/runtime';
import { errorMessage } from '../../../lib/errors';
import { formatIngredient } from '../../../lib/format';
import { recipePhotoUri } from '../../../lib/media';
import { haptic } from '../../../services/haptics';
import { preparePhoto } from '../../../services/photos';
import { framesFor } from '../../../services/videoFrames';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  RecipePhoto,
  Screen,
  Text,
  useActionSheet,
  usePrompt,
  useToast,
} from '../../../ui';

/**
 * Right after something shared is saved: the recipe at a glance — name, photo, ingredients,
 * steps — with one-tap fixes for what an import gets wrong (a line in the wrong list, the name,
 * a better picture from the video). "It's good" opens the recipe.
 */
export default function ImportReview() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const repos = useRepos();
  const sheet = useActionSheet();
  const prompt = usePrompt();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useLive(['recipe'], (r) => r.recipe(id), [id]);
  const [frames] = useState(() => (id ? framesFor(id) : []));
  const locale = i18n.language as Locale;
  const system = useLive(['settings'], (r) => r.settings().unitSystem);

  if (!recipe) {
    return (
      <Screen edges={['top', 'bottom']}>
        <EmptyState
          emoji="🔍"
          title={t('recipe.notFoundTitle')}
          action={t('common.close')}
          onAction={() => router.back()}
        />
      </Screen>
    );
  }
  const d = recipe.data;
  const save = async (patch: Parameters<typeof repos.updateRecipe>[1]) => {
    try {
      await repos.updateRecipe(recipe.id, patch);
      haptic.selection();
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };
  const ingText = (i: Ingredient) => {
    const f = formatIngredient(i, 1, locale, system);
    return [f.amount, f.name, f.note ? `(${f.note})` : ''].filter(Boolean).join(' ');
  };
  const toStep = (i: Ingredient): Step => {
    const text = ingText(i);
    return { id: uuidv7(), group: null, text, timerSeconds: null, timerLabel: null };
  };
  const toIngredient = (s: Step): Ingredient => {
    const p = parseIngredientLine(s.text);
    return {
      id: uuidv7(),
      group: null,
      name: (p?.name ?? s.text).slice(0, 200),
      quantity: p?.quantity ?? null,
      quantityMax: p?.quantityMax ?? null,
      unit: p?.unit ?? null,
      note: p?.note ?? null,
    };
  };

  const ingredientActions = (i: Ingredient) =>
    sheet({
      title: ingText(i),
      options: [
        {
          label: t('review.isStep'),
          icon: 'list-outline',
          onPress: () =>
            void save({
              ingredients: d.ingredients.filter((x) => x.id !== i.id),
              steps: [...d.steps, toStep(i)],
            }),
        },
        {
          label: t('common.delete'),
          icon: 'trash-outline',
          destructive: true,
          onPress: () => void save({ ingredients: d.ingredients.filter((x) => x.id !== i.id) }),
        },
      ],
    });
  const stepActions = (s: Step, n: number) =>
    sheet({
      title: t('recipe.stepN', { n: n + 1 }),
      options: [
        {
          label: t('review.isIngredient'),
          icon: 'nutrition-outline',
          onPress: () =>
            void save({
              steps: d.steps.filter((x) => x.id !== s.id),
              ingredients: [...d.ingredients, toIngredient(s)],
            }),
        },
        {
          label: t('common.delete'),
          icon: 'trash-outline',
          destructive: true,
          onPress: () => void save({ steps: d.steps.filter((x) => x.id !== s.id) }),
        },
      ],
    });
  /** Lines left in the notes (the method was not found): they become the steps. */
  const notesToSteps = () => {
    const lines = (d.notes ?? '')
      .split('\n')
      .map((l) => l.replace(/^[-–•*·\d.)\s]+/, '').trim())
      .filter((l) => l.length > 12 && !/^[#@]/.test(l) && !l.startsWith('🎙️'));
    if (!lines.length) return;
    void save({
      steps: [
        ...d.steps,
        ...lines.map((text) => ({
          id: uuidv7(),
          group: null,
          text,
          timerSeconds: parseTimerSeconds(text),
          timerLabel: null,
        })),
      ],
      notes: null,
    });
  };
  const choosePhoto = async (uri: string) => {
    try {
      await repos.updateRecipe(recipe.id, { photoKey: await preparePhoto(uri) });
      haptic.success();
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };
  // The video's pictures stay offered in the editor too ("choose a picture from the video").
  const done = () => router.replace(`/recipe/${recipe.id}`);
  const missing = [
    !d.ingredients.length ? t('review.noIngredients') : null,
    !d.steps.length ? t('review.noSteps') : null,
  ].filter(Boolean);

  return (
    <Screen scroll={false} edges={['top', 'bottom']} maxWidth={640}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: space.md }}>
        <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
          {t('review.title')}
        </Text>
        <IconButton icon="close" label={t('common.close')} onPress={done} />
      </View>
      <ScrollView contentContainerStyle={{ gap: space.lg, paddingVertical: space.lg }}>
        <Text variant="callout" color="textMuted">
          {t('review.hint')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('review.rename')}
          onPress={() =>
            prompt({
              title: t('review.rename'),
              initial: d.title,
              maxLength: 200,
              onSubmit: (v) => void save({ title: v }),
            })
          }
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
          testID="review-title"
        >
          <RecipePhoto
            uri={recipePhotoUri(recipe)}
            category={d.category}
            radius={radius.md}
            style={{ width: 72, height: 72 }}
            emojiSize={30}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title3" numberOfLines={3}>
              {d.title}
            </Text>
            <Text variant="caption" color="textMuted">
              {t('review.counts', { ingredients: d.ingredients.length, steps: d.steps.length })}
            </Text>
          </View>
          <Icon name="create-outline" size={20} color="primary" />
        </Pressable>

        {frames.length ? (
          <View style={{ gap: space.sm }}>
            <Text variant="bodyStrong">{t('review.photo')}</Text>
            <ScrollView horizontal contentContainerStyle={{ gap: space.sm }}>
              {frames.map((uri, n) => (
                <Pressable
                  key={uri}
                  accessibilityRole="button"
                  accessibilityLabel={t('review.photoN', { n: n + 1 })}
                  onPress={() => void choosePhoto(uri)}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: 90, height: 120, borderRadius: radius.md }}
                    accessibilityIgnoresInvertColors
                  />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {missing.length ? (
          <View style={[styles.warn, { backgroundColor: colors.accentSoft }]}>
            <Icon name="alert-circle-outline" size={20} color="accent" />
            <Text variant="callout" style={{ flex: 1 }}>
              {missing.join(' ')}
            </Text>
          </View>
        ) : null}
        {!d.steps.length && d.notes ? (
          <Button
            title={t('review.notesToSteps')}
            icon="list-outline"
            variant="secondary"
            onPress={notesToSteps}
            testID="review-notes-to-steps"
          />
        ) : null}

        <View style={{ gap: space.xs }}>
          <Text variant="title3">
            {t('recipe.ingredients')} · {d.ingredients.length}
          </Text>
          {d.ingredients.map((i) => (
            <Pressable
              key={i.id}
              accessibilityRole="button"
              accessibilityHint={t('review.fixHint')}
              onPress={() => ingredientActions(i)}
              style={({ pressed }) => [
                styles.line,
                { borderBottomColor: colors.line, opacity: pressed ? 0.7 : 1 },
              ]}
              testID="review-ingredient"
            >
              <Text variant="body" style={{ flex: 1 }}>
                {ingText(i)}
              </Text>
              <Icon name="ellipsis-horizontal" size={18} color="textSubtle" />
            </Pressable>
          ))}
        </View>
        <View style={{ gap: space.xs }}>
          <Text variant="title3">
            {t('recipe.steps')} · {d.steps.length}
          </Text>
          {d.steps.map((s, n) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityHint={t('review.fixHint')}
              onPress={() => stepActions(s, n)}
              style={({ pressed }) => [
                styles.line,
                { borderBottomColor: colors.line, opacity: pressed ? 0.7 : 1 },
              ]}
              testID="review-step"
            >
              <Text variant="bodyStrong" color="primary">
                {n + 1}
              </Text>
              <Text variant="callout" style={{ flex: 1 }} numberOfLines={4}>
                {s.text}
              </Text>
              <Icon name="ellipsis-horizontal" size={18} color="textSubtle" />
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={{ gap: space.sm, paddingBottom: space.md }}>
        <Button
          title={t('review.ok')}
          icon="checkmark"
          size="lg"
          onPress={done}
          testID="review-ok"
        />
        <Button
          title={t('review.editAll')}
          variant="ghost"
          onPress={() => router.replace({ pathname: '/recipe/edit', params: { id: recipe.id } })}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
