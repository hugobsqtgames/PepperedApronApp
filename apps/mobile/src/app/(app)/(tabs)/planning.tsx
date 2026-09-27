import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { addDays, MEAL_SLOTS, startOfWeek, toIsoDate, weekDates, type MealSlot } from '@pepperedapron/core';
import type { LocalRecord } from '@pepperedapron/client';
import { entryActions } from '../../../features/planning/actions';
import { useLive, useRepos } from '../../../hooks/runtime';
import { dayLong, dayMonth, dayShort } from '../../../lib/dates';
import { errorMessage } from '../../../lib/errors';
import { useLayout } from '../../../lib/layout';
import { recipePhotoUri } from '../../../lib/media';
import { track } from '../../../services/analytics';
import { haptic } from '../../../services/haptics';
import { scheduleShoppingReady } from '../../../services/notifications';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import { Button, Icon, IconButton, RecipePhoto, Text, useActionSheet, useToast } from '../../../ui';

type Entry = LocalRecord<'mealPlanEntry'>;

export default function Planning() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const repos = useRepos();
  const layout = useLayout();
  const sheet = useActionSheet();
  const toast = useToast();
  const today = toIsoDate(new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const days = useMemo(() => weekDates(weekStart), [weekStart]);
  const end = days[6]!;
  const { entries, titles } = useLive(['mealPlanEntry', 'recipe'], (r) => {
    const es = r.entries(weekStart, end);
    const titles = new Map<string, { title: string; recipe: ReturnType<typeof r.recipe> }>();
    for (const e of es) {
      const rec = e.data.recipeId ? r.recipe(e.data.recipeId) : null;
      titles.set(e.id, { title: rec?.data.title ?? e.data.customTitle ?? '—', recipe: rec });
    }
    return { entries: es, titles };
  }, [weekStart, end]);

  const cell = (d: string, s: MealSlot) => entries.filter((e) => e.data.date === d && e.data.slot === s);
  const add = (d: string, s: MealSlot) => router.push({ pathname: '/plan/pick', params: { date: d, slot: s } });

  const toShopping = async () => {
    try {
      const list = await repos.ensureActiveList(t('shopping.defaultName'));
      const r = await repos.addPlanToList(list.id, weekStart, end);
      if (r.added + r.updated === 0) return toast(t('planning.toShoppingEmpty'), { tone: 'info' });
      haptic.success();
      track('shopping_generated', { items: r.added + r.updated });
      void scheduleShoppingReady(repos, r.added + r.updated);
      toast(t('planning.toShoppingDone', { list: list.data.name, added: r.added, updated: r.updated }), { action: { label: t('tabs.shopping'), onPress: () => router.push('/shopping') } });
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  const EntryChip = ({ e, compact }: { e: Entry; compact?: boolean }) => {
    const info = titles.get(e.id);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${info?.title}${e.data.servings ? `, ${t('common.servings', { count: e.data.servings })}` : ''}`}
        accessibilityHint={t('planning.moveTo')}
        onPress={() => entryActions(sheet, repos, t, i18n.language, e.id, weekStart)}
        onLongPress={() => info?.recipe && router.push(`/recipe/${info.recipe.id}`)}
        style={({ pressed }) => [styles.entry, { backgroundColor: colors.surfaceRaised, borderColor: colors.line, opacity: pressed ? 0.8 : 1 }]}
      >
        {!compact ? <RecipePhoto uri={info?.recipe ? recipePhotoUri(info.recipe) : null} category={info?.recipe?.data.category ?? null} radius={8} style={{ width: 34, height: 34 }} emojiSize={16} /> : null}
        <Text variant="callout" numberOfLines={2} style={{ flex: 1 }}>
          {info?.title}
        </Text>
        {e.data.servings ? (
          <Text variant="caption" color="textMuted">
            ×{e.data.servings}
          </Text>
        ) : null}
        {e.state !== 'synced' ? <Icon name="cloud-upload-outline" size={12} color="textSubtle" /> : null}
      </Pressable>
    );
  };

  const header = (
    <View style={{ gap: space.md, paddingHorizontal: layout.gutter, paddingTop: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
          {t('planning.title')}
        </Text>
        <Button title={t('planning.calendar')} icon="calendar-outline" variant="ghost" size="sm" onPress={() => router.push('/calendar')} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <IconButton icon="chevron-back" label={t('common.back')} onPress={() => setWeekStart(addDays(weekStart, -7))} />
        <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={() => setWeekStart(startOfWeek(today))} accessibilityRole="button" accessibilityHint={t('planning.today')}>
          <Text variant="bodyStrong" align="center">
            {weekStart === startOfWeek(today) ? t('planning.thisWeek') : t('planning.weekOf', { date: dayMonth(weekStart, i18n.language) })}
          </Text>
          <Text variant="caption" color="textMuted">
            {dayMonth(weekStart, i18n.language)} – {dayMonth(end, i18n.language)}
          </Text>
        </Pressable>
        <IconButton icon="chevron-forward" label={t('common.next')} onPress={() => setWeekStart(addDays(weekStart, 7))} />
      </View>
      <Button title={t('planning.toShopping')} icon="cart-outline" variant="secondary" onPress={toShopping} testID="plan-to-shopping" />
      {entries.length === 0 ? (
        <View style={[styles.hint, { backgroundColor: colors.primarySoft }]}>
          <Text variant="bodyStrong">{t('planning.emptyWeekTitle')}</Text>
          <Text variant="callout" color="textMuted">
            {t('planning.emptyWeekBody')}
          </Text>
        </View>
      ) : null}
    </View>
  );

  // iPad / wide screens: a real week grid (days × meals).
  if (layout.wide) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ paddingBottom: space.huge, gap: space.lg }}>
          {header}
          <ScrollView horizontal contentContainerStyle={{ paddingHorizontal: layout.gutter }}>
            <View>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: 110 }} />
                {days.map((d) => (
                  <View key={d} style={[styles.gridHead, { width: 150, backgroundColor: d === today ? colors.primarySoft : 'transparent' }]}>
                    <Text variant="bodyStrong" color={d === today ? 'primary' : 'text'}>
                      {dayShort(d, i18n.language)}
                    </Text>
                  </View>
                ))}
              </View>
              {MEAL_SLOTS.map((s) => (
                <View key={s} style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line }}>
                  <View style={{ width: 110, paddingVertical: space.md, paddingRight: space.sm }}>
                    <Text variant="caption" color="textMuted" weight="600">
                      {t(`slots.${s}`)}
                    </Text>
                  </View>
                  {days.map((d) => (
                    <View key={d} style={{ width: 150, padding: 4, gap: 4, minHeight: 80, backgroundColor: d === today ? colors.primarySoft : 'transparent' }}>
                      {cell(d, s).map((e) => <EntryChip key={e.id} e={e} compact />)}
                      <Pressable accessibilityRole="button" accessibilityLabel={`${t('planning.addMeal')} — ${t(`slots.${s}`)}, ${dayLong(d, i18n.language)}`} onPress={() => add(d, s)} style={[styles.addCell, { borderColor: colors.line }]}>
                        <Icon name="add" size={18} color="textSubtle" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.huge * 2, gap: space.lg }}>
        {header}
        <View style={{ paddingHorizontal: layout.gutter, gap: space.md }}>
          {days.map((d) => {
            const count = entries.filter((e) => e.data.date === d).length;
            return (
              <View key={d} style={[styles.day, { backgroundColor: colors.surface, borderColor: d === today ? colors.primary : colors.line, borderWidth: d === today ? 1.5 : StyleSheet.hairlineWidth }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text variant="title3" style={{ flex: 1 }} accessibilityRole="header">
                    {dayLong(d, i18n.language)}
                  </Text>
                  {d === today ? (
                    <Text variant="micro" color="primary" style={{ textTransform: 'uppercase' }}>
                      {t('planning.today')}
                    </Text>
                  ) : count ? (
                    <Text variant="caption" color="textMuted">
                      {t('planning.dayMeals', { count })}
                    </Text>
                  ) : null}
                </View>
                {MEAL_SLOTS.map((s) => {
                  const items = cell(d, s);
                  return (
                    <View key={s} style={styles.slot}>
                      <Text variant="caption" color="textMuted" style={{ width: 92 }} numberOfLines={1}>
                        {t(`slots.${s}`)}
                      </Text>
                      <View style={{ flex: 1, gap: 6 }}>
                        {items.map((e) => <EntryChip key={e.id} e={e} />)}
                      </View>
                      <IconButton icon="add" label={`${t('planning.addMeal')} — ${t(`slots.${s}`)}, ${dayLong(d, i18n.language)}`} variant="plain" size={40} onPress={() => add(d, s)} testID={`plan-add-${d}-${s}`} />
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  day: { borderRadius: radius.xl, padding: space.md, gap: 2 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: 6, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, minHeight: 44 },
  hint: { gap: 2, padding: space.md, borderRadius: radius.lg },
  gridHead: { paddingVertical: space.sm, alignItems: 'center', borderRadius: radius.sm },
  addCell: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderStyle: 'dashed', minHeight: 36 },
});
