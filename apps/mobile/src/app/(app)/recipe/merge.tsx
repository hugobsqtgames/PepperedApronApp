import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  computeTotalMinutes,
  formatMinutes,
  type Locale,
  type RecipeData,
} from '@pepperedapron/core';
import { useRepos } from '../../../hooks/runtime';
import { errorMessage } from '../../../lib/errors';
import { recipePhotoUri } from '../../../lib/media';
import { haptic } from '../../../services/haptics';
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
  useToast,
} from '../../../ui';

type Field =
  'title' | 'photo' | 'description' | 'times' | 'ingredients' | 'steps' | 'notes' | 'source';
const FIELDS: Field[] = [
  'title',
  'photo',
  'description',
  'times',
  'ingredients',
  'steps',
  'notes',
  'source',
];

/** What each choice copies from the chosen version. */
const PICK: Record<Field, (keyof RecipeData)[]> = {
  title: ['title'],
  photo: ['photoKey'],
  description: ['description'],
  times: [
    'servings',
    'yieldLabel',
    'prepMinutes',
    'cookMinutes',
    'restMinutes',
    'totalMinutes',
    'ovenTemperatureC',
  ],
  ingredients: ['ingredients'],
  steps: ['steps'],
  notes: ['tips', 'notes', 'personalNote'],
  source: ['sourceUrl', 'source'],
};

/**
 * Two copies of one recipe → one: for each part, keep this version or the other. Favorites,
 * collections, history and planning of both are kept on the merged recipe.
 */
export default function MergeRecipes() {
  const { keep, drop } = useLocalSearchParams<{ keep: string; drop: string }>();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const repos = useRepos();
  const toast = useToast();
  const a = repos.recipe(keep);
  const b = repos.recipe(drop);
  const empty = (r: RecipeData, f: Field) =>
    PICK[f].every((k) => {
      const v = r[k];
      return v === null || v === '' || (Array.isArray(v) && v.length === 0);
    });
  const [picks, setPicks] = useState<Record<Field, 'a' | 'b'>>(
    () =>
      Object.fromEntries(
        FIELDS.map((f) => [f, a && b && empty(a.data, f) && !empty(b.data, f) ? 'b' : 'a']),
      ) as Record<Field, 'a' | 'b'>,
  );
  const [busy, setBusy] = useState(false);

  if (!a || !b)
    return (
      <Screen edges={['top', 'bottom']}>
        <EmptyState
          emoji="🍂"
          title={t('recipe.notFoundTitle')}
          action={t('common.close')}
          onAction={() => router.back()}
        />
      </Screen>
    );

  const summary = (r: RecipeData, f: Field): string => {
    if (empty(r, f)) return t('merge.empty');
    if (f === 'title') return r.title;
    if (f === 'description') return r.description ?? '';
    if (f === 'times') {
      const m = computeTotalMinutes(r);
      return [
        t('common.servings', { count: r.servings }),
        m ? formatMinutes(m, i18n.language as Locale) : null,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    if (f === 'ingredients')
      return `${t('merge.count', { count: r.ingredients.length })} — ${r.ingredients
        .slice(0, 4)
        .map((i) => i.name)
        .join(', ')}`;
    if (f === 'steps')
      return `${t('merge.count', { count: r.steps.length })} — ${r.steps[0]?.text ?? ''}`;
    if (f === 'notes') return [r.tips, r.notes, r.personalNote].filter(Boolean).join(' · ');
    if (f === 'source') return r.source ?? r.sourceUrl ?? '';
    return '';
  };

  const merge = async () => {
    setBusy(true);
    try {
      const data: RecipeData = { ...a.data };
      for (const f of FIELDS)
        if (picks[f] === 'b')
          for (const k of PICK[f]) (data as Record<string, unknown>)[k] = b.data[k];
      await repos.mergeRecipes(a.id, b.id, data);
      haptic.success();
      toast(t('merge.done'));
      router.replace(`/recipe/${a.id}`);
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
      setBusy(false);
    }
  };

  const option = (f: Field, side: 'a' | 'b') => {
    const r = side === 'a' ? a : b;
    const on = picks[f] === side;
    return (
      <Pressable
        key={side}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        onPress={() => setPicks((p) => ({ ...p, [f]: side }))}
        style={[
          styles.option,
          {
            borderColor: on ? colors.primary : colors.line,
            backgroundColor: on ? colors.primarySoft : colors.surface,
          },
        ]}
      >
        <Icon
          name={on ? 'radio-button-on' : 'radio-button-off'}
          size={20}
          tint={on ? colors.primary : colors.textSubtle}
        />
        {f === 'photo' ? (
          <RecipePhoto
            uri={recipePhotoUri(r)}
            category={r.data.category}
            style={{ width: 72, height: 54 }}
            radius={radius.md}
            emojiSize={20}
          />
        ) : (
          <Text variant="callout" numberOfLines={3} style={{ flex: 1 }}>
            {summary(r.data, f)}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: space.md }}>
        <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
          {t('merge.title')}
        </Text>
        <IconButton icon="close" label={t('common.close')} onPress={() => router.back()} />
      </View>
      <Text variant="callout" color="textMuted" style={{ marginVertical: space.md }}>
        {t('merge.hint')}
      </Text>
      <View style={{ gap: space.lg }}>
        {FIELDS.filter((f) => !(empty(a.data, f) && empty(b.data, f))).map((f) => (
          <View key={f} role="radiogroup" style={{ gap: space.xs }}>
            <Text variant="bodyStrong">{t(`merge.fields.${f}`)}</Text>
            {option(f, 'a')}
            {option(f, 'b')}
          </View>
        ))}
        <Button
          title={t('merge.confirm')}
          icon="git-merge-outline"
          onPress={() => void merge()}
          loading={busy}
          testID="merge-confirm"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
});
