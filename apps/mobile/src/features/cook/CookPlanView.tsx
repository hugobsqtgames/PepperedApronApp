import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  clockOf,
  computeTotalMinutes,
  cookingPlan,
  estimateRecipe,
  formatClock,
  formatMinutes,
  readyTimeChoices,
  startTimeFor,
  type Locale,
  type PlanItem,
} from '@pepperedapron/core';
import type { Recipe } from '@pepperedapron/client';
import { haptic } from '../../services/haptics';
import { scheduleStart } from '../../services/startReminder';
import { timers } from '../../services/timers';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Button, Chip, ChipRow, Icon, IconButton, Text, useToast } from '../../ui';

export type PlanMode = 'asap' | 'together';

interface Session {
  startedAt: number | null;
  done: string[];
  ready: string | null;
  reminded: string | null;
}
/** Kept while the app runs: closing and reopening the plan keeps what is done. */
const sessions = new Map<string, Session>();
const EMPTY: Session = { startedAt: null, done: [], ready: null, reminded: null };

function useSession(key: string): [Session, (patch: Partial<Session>) => void] {
  const [, render] = useState(0);
  const update = (patch: Partial<Session>) => {
    sessions.set(key, { ...(sessions.get(key) ?? EMPTY), ...patch });
    render((n) => n + 1);
  };
  return [sessions.get(key) ?? EMPTY, update];
}

const itemKey = (i: PlanItem) => `${i.recipeId}:${i.stepIndex}`;

/**
 * The order of the steps of several recipes cooked by one person: batch cooking (everything as
 * fast as possible, something else is prepared while a dish bakes) or a meal (every dish ready at
 * the same time, at the chosen hour, with a reminder when to start).
 */
export function CookPlanView({
  recipes,
  mode,
  onOpenStep,
}: {
  recipes: Recipe[];
  mode: PlanMode;
  /** Tapping a step: open it (in cook mode). */
  onOpenStep?: (item: PlanItem) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();
  const locale = i18n.language as Locale;
  const ids = recipes.map((r) => r.id);
  const [session, update] = useSession(`${mode}:${ids.join(',')}`);
  const input = useMemo(
    () =>
      recipes.map((r) => ({
        id: r.id,
        title: r.data.title,
        steps: r.data.steps,
        totalMinutes: computeTotalMinutes(r.data),
      })),
    [recipes],
  );
  const plan = useMemo(() => cookingPlan(input, mode), [input, mode]);
  const serial = useMemo(
    () => input.flatMap(estimateRecipe).reduce((s, e) => s + e.active + e.passive, 0),
    [input],
  );
  if (!plan.items.length) return null;

  const timing = session.ready ? startTimeFor(session.ready, plan.minutes) : null;
  const base =
    session.startedAt ?? (mode === 'together' ? (timing?.start.getTime() ?? null) : null);
  const at = (min: number) =>
    base !== null
      ? clockOf(new Date(base + min * 60_000))
      : `+${formatMinutes(min, locale) || '0 min'}`;
  const done = new Set(session.done);
  const current = plan.items.find((i) => !done.has(itemKey(i)));
  const number = (id: string) => ids.indexOf(id) + 1;

  const toggle = (i: PlanItem) => {
    haptic.selection();
    const k = itemKey(i);
    update({ done: done.has(k) ? session.done.filter((x) => x !== k) : [...session.done, k] });
  };
  const remind = async () => {
    if (!timing || !session.ready) return;
    const title = recipes.map((r) => r.data.title).join(' + ');
    const r = await scheduleStart({
      key: `meal-${[...ids].sort().join('-')}`,
      title,
      start: timing.start,
      ready: timing.ready,
      url: `/cook-plan?ids=${ids.join(',')}&mode=together`,
    });
    if (r === 'denied') toast(t('readyAt.denied'), { tone: 'error' });
    else if (r === 'now') toast(t('readyAt.startNow'));
    else {
      update({ reminded: session.ready });
      toast(t('readyAt.scheduled', { time: clockOf(timing.start) }));
    }
  };

  return (
    <View style={{ gap: space.lg }}>
      <View style={[styles.summary, { backgroundColor: colors.primarySoft }]}>
        <Text variant="kicker" color="primary">
          {mode === 'asap' ? t('plan.totalBatch') : t('plan.totalMeal')}
        </Text>
        <Text variant="title1" color="primary" accessibilityRole="header">
          {formatMinutes(plan.minutes, locale)}
        </Text>
        {mode === 'asap' && serial > plan.minutes + 5 ? (
          <Text variant="callout" color="textMuted">
            {t('plan.instead', { time: formatMinutes(serial, locale) })}
          </Text>
        ) : null}
        {plan.recipes.map((r) => (
          <Text key={r.id} variant="callout">
            <Text variant="callout" weight="700">
              {number(r.id)}.{' '}
            </Text>
            {r.title} —{' '}
            {mode === 'together'
              ? t('plan.startsAt', { time: at(r.start) })
              : t('plan.readyAtTime', { time: at(r.end) })}
          </Text>
        ))}
      </View>

      {mode === 'together' ? (
        <View style={{ gap: space.sm }}>
          <Text variant="title3">{t('readyAt.title')}</Text>
          <ChipRow>
            {readyTimeChoices(plan.minutes).map((c) => (
              <Chip
                key={c}
                icon="time-outline"
                label={c}
                selected={session.ready === c}
                onPress={() =>
                  update({ ready: session.ready === c ? null : c, startedAt: null, reminded: null })
                }
              />
            ))}
          </ChipRow>
          {timing ? (
            <View style={{ gap: space.sm }}>
              <Text variant="bodyStrong" color="accent" accessibilityLiveRegion="polite">
                {t('readyAt.startAt', { time: clockOf(timing.start) })}
              </Text>
              <Button
                title={
                  session.reminded === session.ready
                    ? t('readyAt.reminded', { time: clockOf(timing.start) })
                    : t('readyAt.remind', { time: clockOf(timing.start) })
                }
                icon="alarm-outline"
                variant="secondary"
                disabled={session.reminded === session.ready}
                onPress={() => void remind()}
                testID="plan-remind"
              />
            </View>
          ) : null}
        </View>
      ) : null}

      <Button
        title={session.startedAt ? t('plan.restart') : t('plan.go')}
        icon={session.startedAt ? 'refresh' : 'play'}
        variant={session.startedAt ? 'ghost' : 'primary'}
        onPress={() => {
          haptic.success();
          update({ startedAt: session.startedAt ? null : Date.now(), done: [] });
        }}
        testID="plan-start"
      />

      <View style={{ gap: space.sm }} accessibilityRole="list">
        {plan.items.map((i) => {
          const k = itemKey(i);
          const isDone = done.has(k);
          const isNow = current === i;
          const wait = i.end - i.start - i.handsOn;
          return (
            <View
              key={k}
              style={[
                styles.row,
                {
                  backgroundColor: isNow ? colors.accentSoft : colors.surface,
                  borderColor: isNow ? colors.accent : colors.line,
                  opacity: isDone ? 0.55 : 1,
                },
              ]}
              testID="plan-item"
            >
              <View style={{ width: 64, gap: 2 }}>
                <Text variant="bodyStrong" color={isNow ? 'accent' : 'text'}>
                  {at(i.start)}
                </Text>
                {isNow ? (
                  <Text variant="micro" color="accent" style={{ textTransform: 'uppercase' }}>
                    {t('plan.now')}
                  </Text>
                ) : null}
              </View>
              <Pressable
                style={{ flex: 1, gap: 4 }}
                accessibilityRole={onOpenStep ? 'button' : 'text'}
                disabled={!onOpenStep}
                onPress={() => onOpenStep?.(i)}
              >
                <Text variant="kicker" color="primary" numberOfLines={1}>
                  {number(i.recipeId)}. {i.title} · {t('recipe.stepN', { n: i.stepIndex + 1 })}
                </Text>
                <Text
                  variant="callout"
                  style={{ textDecorationLine: isDone ? 'line-through' : 'none' }}
                >
                  {i.text}
                </Text>
                <Text variant="caption" color="textMuted">
                  {wait > 0
                    ? `${t('plan.handsOn', { time: formatMinutes(i.handsOn, locale) })} · ${t('plan.thenWait', { time: formatMinutes(wait, locale) })}`
                    : t('plan.handsOn', { time: formatMinutes(i.handsOn, locale) })}
                </Text>
                {i.timerSeconds ? (
                  <Button
                    title={t('cook.startTimer', { time: formatClock(i.timerSeconds) })}
                    icon="timer-outline"
                    variant="accent"
                    size="sm"
                    style={{ alignSelf: 'flex-start', marginTop: 4 }}
                    onPress={() => {
                      haptic.success();
                      void timers.start({
                        label: `${i.title} · ${t('recipe.stepN', { n: i.stepIndex + 1 })}`,
                        seconds: i.timerSeconds!,
                        recipeId: i.recipeId,
                        stepIndex: i.stepIndex,
                      });
                    }}
                  />
                ) : null}
              </Pressable>
              <IconButton
                icon={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                label={isDone ? t('plan.undo') : t('plan.markDone')}
                variant={isDone ? 'primary' : 'surface'}
                onPress={() => toggle(i)}
              />
            </View>
          );
        })}
      </View>
      {done.size === plan.items.length ? (
        <View
          style={[styles.summary, { backgroundColor: colors.primarySoft, alignItems: 'center' }]}
        >
          <Icon name="checkmark-done-outline" size={28} color="primary" />
          <Text variant="title3" color="primary" align="center">
            {t('plan.allDone')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: space.xs, padding: space.lg, borderRadius: radius.xl },
  row: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
});
