import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { formatClock, timerState, type KitchenTimer } from '@pepperedapron/core';
import { IngredientList } from '../../../../features/recipe/RecipeBody';
import { useLive } from '../../../../hooks/runtime';
import { useLayout } from '../../../../lib/layout';
import { track } from '../../../../services/analytics';
import { haptic } from '../../../../services/haptics';
import { timers } from '../../../../services/timers';
import { useTheme } from '../../../../theme/ThemeProvider';
import { radius, space } from '../../../../theme/tokens';
import { Button, EmptyState, Icon, IconButton, Text } from '../../../../ui';

function useTimers() {
  const [list, setList] = useState<KitchenTimer[]>(timers.list());
  useEffect(() => {
    const off = timers.subscribe(setList);
    return () => void off();
  }, []);
  return list;
}

export default function CookMode() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const layout = useLayout();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { recipe, settings } = useLive(
    ['recipe', 'settings'],
    (r) => ({ recipe: r.recipe(id), settings: r.settings() }),
    [id],
  );
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);
  const list = useRef<FlatList>(null);
  const running = useTimers();

  useEffect(() => {
    track('cook_mode_started');
  }, []);

  if (!recipe) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        <EmptyState
          emoji="🍂"
          title={t('recipe.notFoundTitle')}
          action={t('common.close')}
          onAction={() => router.back()}
        />
      </View>
    );
  }
  const steps = recipe.data.steps;
  const total = steps.length;
  const paneWidth = layout.wide ? width * 0.62 : width;

  const go = (i: number) => {
    const n = Math.max(0, Math.min(total - 1, i));
    if (n === index) return;
    haptic.light();
    setIndex(n);
    list.current?.scrollToIndex({ index: n, animated: true });
  };
  const finish = () => {
    haptic.success();
    track('cook_mode_finished');
    setDone(true);
  };

  if (done) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: insets.top,
          justifyContent: 'center',
        }}
      >
        <EmptyState
          emoji="🍽️"
          title={t('cook.doneTitle')}
          body={t('cook.doneBody')}
          action={t('cook.addNote')}
          onAction={() =>
            router.replace({ pathname: '/recipe/edit', params: { id: recipe.id, focus: 'notes' } })
          }
          secondary={t('common.close')}
          onSecondary={() => router.back()}
        />
      </View>
    );
  }

  const ingredientsPanel = (
    <IngredientList ingredients={recipe.data.ingredients} factor={1} system={settings.unitSystem} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={styles.top}>
        <IconButton icon="close" label={t('cook.exit')} onPress={() => router.back()} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text
            variant="bodyStrong"
            align="center"
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
          >
            {t('cook.step', { n: index + 1, total })}
          </Text>
          <View style={[styles.progress, { backgroundColor: colors.line }]}>
            <View
              style={{
                width: `${((index + 1) / Math.max(total, 1)) * 100}%`,
                height: '100%',
                backgroundColor: colors.accent,
                borderRadius: 3,
              }}
            />
          </View>
        </View>
        {!layout.wide ? (
          <IconButton
            icon="list-outline"
            label={t('cook.ingredients')}
            onPress={() => setShowIngredients(true)}
          />
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: paneWidth }}>
          <FlatList
            ref={list}
            data={steps}
            horizontal
            pagingEnabled
            keyExtractor={(s) => s.id}
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, i) => ({ length: paneWidth, offset: paneWidth * i, index: i })}
            onMomentumScrollEnd={(e) => {
              const i = Math.round(e.nativeEvent.contentOffset.x / paneWidth);
              if (i !== index) {
                haptic.light();
                setIndex(i);
              }
            }}
            renderItem={({ item, index: i }) => (
              <ScrollView
                style={{ width: paneWidth }}
                contentContainerStyle={{ padding: space.xxl, gap: space.xl }}
              >
                {item.group ? (
                  <Text variant="title3" color="accent">
                    {item.group}
                  </Text>
                ) : null}
                <Text
                  variant="cook"
                  maxFontSizeMultiplier={1.6}
                  accessibilityLabel={`${t('recipe.stepN', { n: i + 1 })}. ${item.text}`}
                >
                  {item.text}
                </Text>
                {item.timerSeconds ? (
                  <Button
                    title={t('cook.startTimer', { time: formatClock(item.timerSeconds) })}
                    icon="timer-outline"
                    variant="accent"
                    size="lg"
                    onPress={() => {
                      track('timer_started');
                      void timers.start({
                        label:
                          item.timerLabel ??
                          `${recipe.data.title} · ${t('recipe.stepN', { n: i + 1 })}`,
                        seconds: item.timerSeconds!,
                        recipeId: recipe.id,
                        stepIndex: i,
                      });
                    }}
                    style={{ alignSelf: 'flex-start' }}
                  />
                ) : null}
              </ScrollView>
            )}
          />
        </View>
        {layout.wide ? (
          <ScrollView
            style={{
              flex: 1,
              borderLeftWidth: StyleSheet.hairlineWidth,
              borderLeftColor: colors.line,
            }}
            contentContainerStyle={{ padding: space.xl, gap: space.md }}
          >
            <Text variant="title2">{t('cook.ingredients')}</Text>
            {ingredientsPanel}
          </ScrollView>
        ) : null}
      </View>

      {running.length ? <TimerTray timers={running} /> : null}

      <View style={[styles.nav, { paddingBottom: insets.bottom + space.md }]}>
        <Button
          title={t('cook.previous')}
          icon="arrow-back"
          variant="secondary"
          size="lg"
          disabled={index === 0}
          onPress={() => go(index - 1)}
          style={{ flex: 1, minHeight: 64 }}
        />
        {index < total - 1 ? (
          <Button
            title={t('cook.next')}
            icon="arrow-forward"
            size="lg"
            onPress={() => go(index + 1)}
            style={{ flex: 1.4, minHeight: 64 }}
            testID="cook-next"
          />
        ) : (
          <Button
            title={t('cook.finish')}
            icon="checkmark"
            variant="accent"
            size="lg"
            onPress={finish}
            style={{ flex: 1.4, minHeight: 64 }}
            testID="cook-finish"
          />
        )}
      </View>

      <Modal
        visible={showIngredients}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowIngredients(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.top, { paddingTop: space.lg }]}>
            <Text variant="title2" style={{ flex: 1 }}>
              {t('cook.ingredients')}
            </Text>
            <IconButton
              icon="close"
              label={t('common.close')}
              onPress={() => setShowIngredients(false)}
            />
          </View>
          <ScrollView contentContainerStyle={{ padding: space.xl }}>{ingredientsPanel}</ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function TimerTray({ timers: list }: { timers: KitchenTimer[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const now = Date.now();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: space.sm,
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
      }}
    >
      {list.map((tm) => {
        const state = timerState(tm, now);
        const doneT = state === 'done';
        return (
          <View
            key={tm.id}
            style={[
              styles.timer,
              {
                backgroundColor: doneT ? colors.accent : colors.surfaceRaised,
                borderColor: colors.line,
              },
            ]}
            accessibilityLiveRegion={doneT ? 'assertive' : 'none'}
          >
            <View style={{ gap: 2, maxWidth: 170 }}>
              <Text
                variant="caption"
                numberOfLines={1}
                style={{ color: doneT ? colors.onAccent : colors.textMuted }}
              >
                {tm.label}
              </Text>
              <Text
                variant="title2"
                style={{
                  color: doneT ? colors.onAccent : colors.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {doneT ? '✓ 00:00' : formatClock(timers.remaining(tm))}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {!doneT ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={state === 'paused' ? t('cook.resume') : t('cook.pause')}
                  onPress={() =>
                    void (state === 'paused' ? timers.resume(tm.id) : timers.pause(tm.id))
                  }
                  style={styles.timerBtn}
                  hitSlop={6}
                >
                  <Icon name={state === 'paused' ? 'play' : 'pause'} size={20} tint={colors.text} />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('cook.plusMinute')}
                onPress={() => void timers.extend(tm.id, 60)}
                style={styles.timerBtn}
                hitSlop={6}
              >
                <Text
                  variant="caption"
                  weight="700"
                  style={{ color: doneT ? colors.onAccent : colors.text }}
                >
                  +1
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('cook.stop')}
                onPress={() => void timers.stop(tm.id)}
                style={styles.timerBtn}
                hitSlop={6}
              >
                <Icon name="close" size={20} tint={doneT ? colors.onAccent : colors.text} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  progress: { height: 6, borderRadius: 3, overflow: 'hidden', marginHorizontal: space.lg },
  nav: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  timerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
