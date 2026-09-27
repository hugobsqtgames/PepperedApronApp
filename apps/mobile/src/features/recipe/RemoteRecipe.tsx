import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  computeTotalMinutes,
  formatMinutes,
  type Ingredient,
  type Locale,
  type RecipeCategory,
  type Step,
} from '@pepperedapron/core';
import { useSettings } from '../../hooks/runtime';
import { useLayout } from '../../lib/layout';
import { space } from '../../theme/tokens';
import { Badge, Button, RecipePhoto, Screen, Section, Stepper, Text } from '../../ui';
import { IngredientList, SourceLink, StepList, TextBlock } from './RecipeBody';

export interface RemoteRecipeData {
  id: string;
  title: string;
  description: string | null;
  photoUrl: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  restMinutes: number | null;
  totalMinutes: number | null;
  difficulty: string | null;
  category: string | null;
  ingredients: Ingredient[];
  steps: Step[];
  tips: string | null;
  notes: string | null;
  source: string | null;
  sourceUrl: string | null;
  author: { displayName: string };
  saveCount?: number;
}

/** Read-only view of a recipe that is not in the library (public or shared by link). */
export function RemoteRecipe({ r, actions }: { r: RemoteRecipeData; actions: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const s = useSettings();
  const layout = useLayout();
  const [servings, setServings] = useState(r.servings);
  const total = computeTotalMinutes(r);
  return (
    <Screen edges={['bottom']} padded={false}>
      <RecipePhoto
        uri={r.photoUrl}
        category={(r.category as RecipeCategory) ?? null}
        style={{ width: '100%', aspectRatio: 4 / 3 }}
        emojiSize={64}
      />
      <View style={{ padding: layout.gutter, gap: space.xl }}>
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {total ? (
              <Badge
                icon="time-outline"
                label={formatMinutes(total, i18n.language as Locale)}
                tone="primary"
              />
            ) : null}
            {r.difficulty ? <Badge label={t(`difficulty.${r.difficulty as 'easy'}`)} /> : null}
            {r.saveCount ? (
              <Badge label={t('community.saves', { count: r.saveCount })} tone="accent" />
            ) : null}
          </View>
          <Text variant="hero" accessibilityRole="header">
            {r.title}
          </Text>
          <Text variant="callout" color="textMuted">
            {t('recipe.byAuthor', { name: r.author.displayName })}
          </Text>
          {r.description ? <Text color="textMuted">{r.description}</Text> : null}
        </View>
        {actions}
        <Section title={t('recipe.ingredients')}>
          <Stepper value={servings} onChange={setServings} label={t('recipe.scale')} />
          <IngredientList
            ingredients={r.ingredients}
            factor={servings / r.servings}
            system={s.unitSystem}
          />
        </Section>
        <Section title={t('recipe.steps')}>
          <StepList steps={r.steps} />
        </Section>
        <TextBlock title={t('recipe.tips')} text={r.tips} icon="bulb-outline" />
        <SourceLink source={r.source} url={r.sourceUrl} />
        <Button
          title={t('common.close')}
          variant="ghost"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>
    </Screen>
  );
}
