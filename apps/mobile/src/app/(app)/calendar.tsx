import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { addMonths, isSameMonth, MEAL_SLOTS, monthGrid, toIsoDate } from '@pepperedapron/core';
import { useLive } from '../../hooks/runtime';
import { dayLong, monthYear, weekdayShort } from '../../lib/dates';
import { useLayout } from '../../lib/layout';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Card, IconButton, Text } from '../../ui';

/** Month overview: dots for planned meals; tap a day to see its meals. */
export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const layout = useLayout();
  const today = toIsoDate(new Date());
  const [month, setMonth] = useState(today.slice(0, 7) + '-01');
  const [selected, setSelected] = useState(today);
  const grid = useMemo(() => monthGrid(month), [month]);
  const first = grid[0]![0]!;
  const last = grid[5]![6]!;
  const { byDay, titles } = useLive(['mealPlanEntry', 'recipe'], (r) => {
    const es = r.entries(first, last);
    const byDay = new Map<string, typeof es>();
    for (const e of es) byDay.set(e.data.date, [...(byDay.get(e.data.date) ?? []), e]);
    const titles = new Map(es.map((e) => [e.id, (e.data.recipeId ? r.recipe(e.data.recipeId)?.data.title : e.data.customTitle) ?? '—']));
    return { byDay, titles };
  }, [first, last]);
  const cellSize = Math.min(64, Math.floor((Math.min(layout.width, 720) - layout.gutter * 2) / 7));
  const dayEntries = byDay.get(selected) ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: layout.gutter, gap: space.lg, paddingBottom: space.huge, maxWidth: 760, width: '100%', alignSelf: 'center' }} style={{ backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconButton icon="chevron-back" label={t('common.back')} onPress={() => setMonth(addMonths(month, -1))} />
        <Text variant="title2" align="center" style={{ flex: 1 }} accessibilityRole="header">
          {monthYear(month, i18n.language)}
        </Text>
        <IconButton icon="chevron-forward" label={t('common.next')} onPress={() => setMonth(addMonths(month, 1))} />
      </View>
      <View>
        <View style={{ flexDirection: 'row' }}>
          {grid[0]!.map((d) => (
            <Text key={d} variant="caption" color="textMuted" align="center" style={{ width: cellSize }}>
              {weekdayShort(d, i18n.language)}
            </Text>
          ))}
        </View>
        {grid.map((week) => (
          <View key={week[0]} style={{ flexDirection: 'row' }}>
            {week.map((d) => {
              const n = byDay.get(d)?.length ?? 0;
              const isSel = d === selected;
              const inMonth = isSameMonth(d, month);
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityLabel={`${dayLong(d, i18n.language)}, ${t('planning.dayMeals', { count: n })}`}
                  accessibilityState={{ selected: isSel }}
                  onPress={() => setSelected(d)}
                  style={[styles.cell, { width: cellSize, height: cellSize, backgroundColor: isSel ? colors.primary : d === today ? colors.primarySoft : 'transparent' }]}
                >
                  <Text variant="callout" style={{ color: isSel ? colors.onPrimary : inMonth ? colors.text : colors.textSubtle, fontWeight: d === today ? '700' : '400' }}>
                    {Number(d.slice(8))}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 2, height: 6 }}>
                    {Array.from({ length: Math.min(n, 4) }).map((_, i) => (
                      <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isSel ? colors.onPrimary : colors.accent }} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <Card>
        <Text variant="title3" style={{ marginBottom: space.sm }}>
          {dayLong(selected, i18n.language)}
        </Text>
        {MEAL_SLOTS.map((s) => {
          const items = dayEntries.filter((e) => e.data.slot === s);
          return (
            <View key={s} style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.sm, alignItems: 'flex-start' }}>
              <Text variant="caption" color="textMuted" style={{ width: 96, paddingTop: 2 }}>
                {t(`slots.${s}`)}
              </Text>
              <View style={{ flex: 1, gap: 4 }}>
                {items.length ? (
                  items.map((e) => (
                    <Text key={e.id} variant="body" color={e.data.recipeId ? 'primary' : 'text'} onPress={() => e.data.recipeId && router.push(`/recipe/${e.data.recipeId}`)} accessibilityRole={e.data.recipeId ? 'link' : 'text'}>
                      {titles.get(e.id)}
                    </Text>
                  ))
                ) : (
                  <Text variant="body" color="textSubtle" onPress={() => router.push({ pathname: '/plan/pick', params: { date: selected, slot: s } })} accessibilityRole="button">
                    + {t('planning.addMeal')}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ cell: { alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.md } });
