import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { addDays, MEAL_SLOTS, type MealSlot } from '@pepperedapron/core';
import type { Repos } from '@pepperedapron/client';
import type { SheetOption } from '../../ui';
import { dayLong } from '../../lib/dates';
import { haptic } from '../../services/haptics';

type Show = (o: { title?: string; message?: string; options: SheetOption[] }) => void;

/** Touch-friendly "Déplacer vers…": pick a day of the week, then a meal. */
export function moveMealFlow(
  show: Show,
  repos: Repos,
  t: TFunction,
  locale: string,
  entryId: string,
  weekStart: string,
) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(weekStart, i));
  show({
    title: t('planning.pickDay'),
    options: days.map((d) => ({
      label: dayLong(d, locale),
      onPress: () =>
        setTimeout(
          () =>
            show({
              title: t('planning.pickSlot'),
              options: MEAL_SLOTS.map((s: MealSlot) => ({
                label: t(`slots.${s}`),
                onPress: () => {
                  void repos.moveMeal(entryId, d, s);
                  haptic.success();
                },
              })),
            }),
          350,
        ),
    })),
  });
}

export function entryActions(
  show: Show,
  repos: Repos,
  t: TFunction,
  locale: string,
  entryId: string,
  weekStart: string,
) {
  const e = repos.entries('0000-01-01', '9999-12-31').find((x) => x.id === entryId);
  if (!e) return;
  const recipe = e.data.recipeId ? repos.recipe(e.data.recipeId) : null;
  show({
    title: recipe?.data.title ?? e.data.customTitle ?? '',
    options: [
      ...(recipe
        ? [
            {
              label: t('recipe.startCooking'),
              icon: 'play-outline' as const,
              onPress: () => router.push(`/recipe/${recipe.id}`),
            },
          ]
        : []),
      {
        label: t('planning.moveTo'),
        icon: 'swap-horizontal-outline',
        onPress: () =>
          setTimeout(() => moveMealFlow(show, repos, t, locale, entryId, weekStart), 350),
      },
      {
        label: t('planning.replace'),
        icon: 'refresh-outline',
        onPress: () =>
          router.push({
            pathname: '/plan/pick',
            params: { date: e.data.date, slot: e.data.slot, replace: e.id },
          }),
      },
      {
        label: t('planning.servings'),
        icon: 'people-outline',
        onPress: () =>
          router.push({
            pathname: '/plan/pick',
            params: { date: e.data.date, slot: e.data.slot, replace: e.id, servingsOnly: '1' },
          }),
      },
      {
        label: t('planning.removeMeal'),
        icon: 'trash-outline',
        destructive: true,
        onPress: () => void repos.removeMeal(e.id),
      },
    ],
  });
}
