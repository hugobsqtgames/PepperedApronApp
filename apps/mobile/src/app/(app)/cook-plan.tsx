import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CookPlanView, type PlanMode } from '../../features/cook/CookPlanView';
import { RecipePicker } from '../../features/cook/RecipePicker';
import { useLive } from '../../hooks/runtime';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';
import { Button, Chip, ChipRow, EmptyState, IconButton, Screen, Segmented, Text } from '../../ui';

/** At most this many recipes in one session (beyond, the plan is no longer readable). */
const MAX_RECIPES = 6;

/**
 * Cooking several recipes in one go: batch cooking (the week's dishes as fast as possible) or a
 * meal whose dishes are all ready at the same time. The recipes come from the planning or the
 * recipe page; more can be added.
 */
export default function CookPlanScreen() {
  const { t } = useTranslation();
  const { colors, a11y } = useTheme();
  const params = useLocalSearchParams<{ ids?: string; mode?: string }>();
  const [ids, setIds] = useState<string[]>(() =>
    [...new Set((params.ids ?? '').split(',').filter(Boolean))].slice(0, MAX_RECIPES),
  );
  const [mode, setMode] = useState<PlanMode>(params.mode === 'together' ? 'together' : 'asap');
  const [adding, setAdding] = useState(false);
  const recipes = useLive(
    ['recipe'],
    (r) => ids.map((id) => r.recipe(id)).filter((x): x is NonNullable<typeof x> => !!x),
    [ids.join(',')],
  );
  const cookable = recipes.filter((r) => r.data.steps.length);

  return (
    <Screen scroll={false} edges={['top', 'bottom']} maxWidth={720}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: space.md }}>
        <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
          {mode === 'asap' ? t('plan.batchTitle') : t('plan.mealTitle')}
        </Text>
        <IconButton icon="close" label={t('common.close')} onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ gap: space.lg, paddingVertical: space.lg }}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'asap', label: t('plan.modeBatch') },
            { value: 'together', label: t('plan.modeMeal') },
          ]}
        />
        <Text variant="callout" color="textMuted">
          {mode === 'asap' ? t('plan.batchHint') : t('plan.mealHint')}
        </Text>
        <ChipRow>
          {recipes.map((r, i) => (
            <Chip
              key={r.id}
              label={`${i + 1}. ${r.data.title}  ✕`}
              selected
              onPress={() => setIds((l) => l.filter((x) => x !== r.id))}
            />
          ))}
          {ids.length < MAX_RECIPES ? (
            <Chip
              icon="add"
              label={t('plan.addRecipe')}
              onPress={() => setAdding(true)}
              testID="plan-add-recipe"
            />
          ) : null}
        </ChipRow>
        {cookable.length ? (
          <>
            <CookPlanView recipes={cookable} mode={mode} />
            <Button
              title={t('plan.cookMode')}
              icon="restaurant-outline"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/recipe/[id]/cook',
                  params: {
                    id: cookable[0]!.id,
                    with: cookable
                      .slice(1)
                      .map((r) => r.id)
                      .join(','),
                  },
                })
              }
            />
          </>
        ) : (
          <EmptyState
            emoji="🥘"
            title={t('plan.emptyTitle')}
            body={t('plan.emptyBody')}
            action={t('plan.addRecipe')}
            onAction={() => setAdding(true)}
          />
        )}
      </ScrollView>
      <Modal
        visible={adding}
        animationType={a11y.reduceMotion ? 'fade' : 'slide'}
        presentationStyle="pageSheet"
        onRequestClose={() => setAdding(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <RecipePicker
            title={t('plan.addRecipe')}
            exclude={ids}
            onPick={(id) => {
              setAdding(false);
              setIds((l) => [...l, id].slice(0, MAX_RECIPES));
            }}
            onClose={() => setAdding(false)}
          />
        </View>
      </Modal>
    </Screen>
  );
}
