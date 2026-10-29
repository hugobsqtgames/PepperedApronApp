import { Alert, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { addDays, startOfWeek, toIsoDate } from '@pepperedapron/core';
import { useLive, useRepos } from '../../../hooks/runtime';
import { dayMonth } from '../../../lib/dates';
import { errorMessage } from '../../../lib/errors';
import { haptic } from '../../../services/haptics';
import { space } from '../../../theme/tokens';
import { Button, Group, ListRow, Text, useActionSheet, usePrompt, useToast } from '../../../ui';

/** Reusable weeks: save the week shown, or fill it from a saved one. */
export default function PlanTemplates() {
  const { t, i18n } = useTranslation();
  const repos = useRepos();
  const sheet = useActionSheet();
  const prompt = usePrompt();
  const toast = useToast();
  const params = useLocalSearchParams<{ weekStart?: string }>();
  const weekStart = params.weekStart ?? startOfWeek(toIsoDate(new Date()));
  const end = addDays(weekStart, 6);
  const { templates, weekCount } = useLive(
    ['planTemplate', 'mealPlanEntry'],
    (r) => ({ templates: r.templates(), weekCount: r.entries(weekStart, end).length }),
    [weekStart, end],
  );
  const week = `${dayMonth(weekStart, i18n.language)} – ${dayMonth(end, i18n.language)}`;

  const save = () => {
    if (!weekCount) return toast(t('planning.emptyWeekToSave'), { tone: 'info' });
    prompt({
      title: t('planning.templateName'),
      placeholder: t('planning.templatePlaceholder'),
      maxLength: 80,
      onSubmit: async (name) => {
        try {
          await repos.saveWeekAsTemplate(name, weekStart);
          haptic.success();
          toast(t('planning.templateSaved'));
        } catch (e) {
          toast(errorMessage(e, t), { tone: 'error' });
        }
      },
    });
  };

  const apply = async (id: string, replace: boolean) => {
    const n = await repos.applyTemplate(id, weekStart, replace);
    haptic.success();
    toast(t('planning.applied', { count: n }));
    router.back();
  };

  const actions = (id: string, name: string) =>
    sheet({
      title: name,
      message: week,
      options: [
        {
          label: t('planning.applyAdd'),
          icon: 'add-circle-outline',
          onPress: () => void apply(id, false),
        },
        {
          label: t('planning.applyReplace'),
          icon: 'refresh-outline',
          onPress: () => void apply(id, true),
        },
        {
          label: t('common.rename'),
          icon: 'pencil-outline',
          onPress: () =>
            setTimeout(
              () =>
                prompt({
                  title: t('planning.templateName'),
                  initial: name,
                  maxLength: 80,
                  onSubmit: (v) => void repos.renameTemplate(id, v),
                }),
              350,
            ),
        },
        {
          label: t('common.delete'),
          icon: 'trash-outline',
          destructive: true,
          onPress: () =>
            Alert.alert(t('planning.deleteTemplate'), name, [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('common.delete'),
                style: 'destructive',
                onPress: () => void repos.deleteTemplate(id),
              },
            ]),
        },
      ],
    });

  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        <Text variant="title2" accessibilityRole="header">
          {t('planning.templates')}
        </Text>
        <Text variant="callout" color="textMuted">
          {t('planning.templatesHint')}
        </Text>
      </View>
      <Button title={t('planning.saveWeek')} icon="bookmark-outline" onPress={save} />
      <Text variant="caption" color="textMuted">
        {week}
      </Text>
      {templates.length ? (
        <Group>
          {templates.map((tp) => (
            <ListRow
              key={tp.id}
              icon="calendar-outline"
              title={tp.data.name}
              value={t('planning.templateMeals', { count: tp.data.meals.length })}
              onPress={() => actions(tp.id, tp.data.name)}
            />
          ))}
        </Group>
      ) : (
        <Text variant="callout" color="textMuted">
          {t('planning.noTemplates')}
        </Text>
      )}
    </ScrollView>
  );
}
