import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { formatClock, timerState, type KitchenTimer } from '@pepperedapron/core';
import { timers } from '../../services/timers';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Icon, Text } from '../../ui';

const SIZE = 76;
const STROKE = 7;

/** One timer: a ring that empties as time goes by, like a hob's dial. */
export function TimerRing({
  timer,
  now,
  color,
}: {
  timer: KitchenTimer;
  now: number;
  color: string;
}) {
  const { colors } = useTheme();
  const left = timers.remaining(timer);
  const state = timerState(timer, now);
  const ratio =
    state === 'done' ? 0 : Math.max(0, Math.min(1, left / Math.max(1, timer.durationSeconds)));
  const r = (SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          stroke={colors.line}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={r}
          stroke={state === 'done' ? colors.accent : color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - (state === 'done' ? 1 : ratio))}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          opacity={state === 'paused' ? 0.45 : 1}
        />
      </Svg>
      <Text
        variant="callout"
        weight="700"
        style={{
          fontVariant: ['tabular-nums'],
          color: state === 'done' ? colors.accentText : colors.text,
        }}
        maxFontSizeMultiplier={1.3}
      >
        {state === 'done' ? '✓' : formatClock(left)}
      </Text>
    </View>
  );
}

/** Ring colours: one per timer, so "pasta" and "sauce" are told apart at a glance. */
function ringColors(c: { primary: string; accent: string }): string[] {
  return [c.primary, c.accent, '#6E8FD8', '#C9A227', '#9B5DE5', '#2A9D8F'];
}

export function TimerRings({ list }: { list: KitchenTimer[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const now = Date.now();
  const palette = ringColors(colors);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={t('delight.cook.timers')}
    >
      {list.map((tm, i) => {
        const state = timerState(tm, now);
        const done = state === 'done';
        return (
          <View
            key={tm.id}
            style={[
              styles.card,
              {
                backgroundColor: done ? colors.accentSoft : colors.surfaceRaised,
                borderColor: colors.line,
              },
            ]}
            accessible
            accessibilityLabel={
              done
                ? t('cook.timerDone', { label: tm.label })
                : `${tm.label}, ${formatClock(timers.remaining(tm))}`
            }
            accessibilityLiveRegion={done ? 'assertive' : 'none'}
            testID="timer-ring"
          >
            <TimerRing timer={tm} now={now} color={palette[i % palette.length]!} />
            <View style={{ gap: space.xs, maxWidth: 130 }}>
              <Text variant="caption" weight="600" numberOfLines={2}>
                {tm.label}
              </Text>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {!done ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={state === 'paused' ? t('cook.resume') : t('cook.pause')}
                    onPress={() =>
                      void (state === 'paused' ? timers.resume(tm.id) : timers.pause(tm.id))
                    }
                    style={styles.btn}
                    hitSlop={4}
                  >
                    <Icon
                      name={state === 'paused' ? 'play' : 'pause'}
                      size={18}
                      tint={colors.text}
                    />
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('cook.plusMinute')}
                  onPress={() => void timers.extend(tm.id, 60)}
                  style={styles.btn}
                  hitSlop={4}
                >
                  <Text variant="caption" weight="700">
                    +1
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('cook.stop')}
                  onPress={() => void timers.stop(tm.id)}
                  style={styles.btn}
                  hitSlop={4}
                >
                  <Icon name="close" size={18} tint={colors.text} />
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    paddingRight: space.md,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
