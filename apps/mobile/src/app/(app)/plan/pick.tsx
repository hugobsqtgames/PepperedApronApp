import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  EMPTY_FILTERS,
  MEAL_SLOTS,
  searchRecipes,
  toIsoDate,
  type MealSlot,
} from '@pepperedapron/core';
import { useLive, useRepos } from '../../../hooks/runtime';
import { dayLong } from '../../../lib/dates';
import { errorMessage } from '../../../lib/errors';
import { track } from '../../../services/analytics';
import { haptic } from '../../../services/haptics';
import { useTheme } from '../../../theme/ThemeProvider';
import { space } from '../../../theme/tokens';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  IconButton,
  RecipeCard,
  Segmented,
  Stepper,
  Text,
  TextField,
  useToast,
} from '../../../ui';

/**
 * Plan a meal. Three entry points:
 * - from the planning grid (date + slot known) → choose a recipe or a free-text meal;
 * - from a recipe (recipeId known) → choose the day and the meal;
 * - "replace"/"servings" on an existing entry.
 */
export default function PickMeal() {
  const params = useLocalSearchParams<{
    date?: string;
    slot?: MealSlot;
    recipeId?: string;
    replace?: string;
    servingsOnly?: string;
  }>();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const repos = useRepos();
  const toast = useToast();
  const today = toIsoDate(new Date());
  const [date, setDate] = useState(params.date ?? today);
  const [slot, setSlot] = useState<MealSlot>(params.slot ?? 'dinner');
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const existing = params.replace
    ? (repos.entries('0000-01-01', '9999-12-31').find((e) => e.id === params.replace) ?? null)
    : null;
  const [servings, setServings] = useState<number>(
    existing?.data.servings ??
      (params.recipeId ? repos.recipe(params.recipeId)?.data.servings : null) ??
      repos.settings().defaultServings,
  );
  const items = useLive(['recipe'], (r) =>
    r.searchable(
      r
        .library()
        .concat(r.favoriteRecipes().filter((f) => !r.library().some((l) => l.id === f.id))),
    ),
  );
  const results = useMemo(
    () => (query.trim() ? searchRecipes(items, query, EMPTY_FILTERS).map((x) => x.recipe) : items),
    [items, query],
  );

  const done = () => {
    haptic.success();
    track('meal_planned');
    router.back();
  };

  const choose = async (recipeId: string | null, customTitle: string | null) => {
    try {
      if (existing) await repos.updateMeal(existing.id, { recipeId, customTitle, servings });
      else await repos.planMeal({ date, slot, recipeId, customTitle, servings });
      done();
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const header = (
    <View style={{ gap: space.md, padding: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="title2" style={{ flex: 1 }} accessibilityRole="header">
          {params.recipeId
            ? t('recipe.addToPlan')
            : existing
              ? t('planning.replace')
              : t('planning.chooseRecipe')}
        </Text>
        <IconButton icon="close" label={t('common.close')} onPress={() => router.back()} />
      </View>
      {params.recipeId || !params.date ? (
        <>
          <ChipRow>
            {days.map((d) => (
              <Chip
                key={d}
                label={dayLong(d, i18n.language)}
                selected={d === date}
                onPress={() => setDate(d)}
              />
            ))}
          </ChipRow>
          <Segmented
            value={slot}
            onChange={setSlot}
            options={MEAL_SLOTS.map((s) => ({ value: s, label: t(`slots.${s}`) }))}
          />
        </>
      ) : (
        <Text color="textMuted">
          {dayLong(date, i18n.language)} · {t(`slots.${slot}`)}
        </Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="bodyStrong">{t('planning.servings')}</Text>
        <Stepper value={servings} onChange={setServings} label={t('planning.servings')} />
      </View>
      {params.recipeId ? (
        <Button
          title={t('common.add')}
          size="lg"
          onPress={() => choose(params.recipeId!, null)}
          testID="plan-confirm"
        />
      ) : params.servingsOnly && existing ? (
        <Button
          title={t('common.save')}
          size="lg"
          onPress={() => choose(existing.data.recipeId, existing.data.customTitle)}
        />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
            <TextField
              containerStyle={{ flex: 1 }}
              label={t('planning.customMeal')}
              placeholder={t('planning.customPlaceholder')}
              value={custom}
              onChangeText={setCustom}
              maxLength={200}
              onSubmitEditing={() => custom.trim() && void choose(null, custom.trim())}
            />
            <Button
              title={t('common.add')}
              onPress={() => choose(null, custom.trim())}
              disabled={!custom.trim()}
              style={{ marginTop: 22 }}
            />
          </View>
          <TextField
            icon="search"
            placeholder={t('search.placeholder')}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={params.recipeId || params.servingsOnly ? [] : results}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.huge }}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: space.lg }}>
            <RecipeCard
              recipe={item.record}
              variant="row"
              onPress={() => void choose(item.id, null)}
            />
          </View>
        )}
        ListEmptyComponent={
          params.recipeId || params.servingsOnly ? null : (
            <EmptyState
              emoji="📖"
              title={t('planning.noRecipes')}
              action={t('home.addFirst')}
              onAction={() => router.replace('/add')}
            />
          )
        }
      />
    </SafeAreaView>
  );
}
