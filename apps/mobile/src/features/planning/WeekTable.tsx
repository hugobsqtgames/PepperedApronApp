import { useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type HostInstance,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { MEAL_SLOTS, type MealSlot } from '@pepperedapron/core';
import type { LocalRecord, Recipe } from '@pepperedapron/client';
import { dayLong } from '../../lib/dates';
import { recipePhotoUri } from '../../lib/media';
import { haptic } from '../../services/haptics';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Icon, longPressActions, RecipePhoto, Text } from '../../ui';

type Entry = LocalRecord<'mealPlanEntry'>;
const TILE = 112;

/** The day whose row is under a point of the screen, or null between rows. */
export function dayAt(
  y: number,
  rows: { date: string; top: number; bottom: number }[],
): string | null {
  return rows.find((r) => y >= r.top && y <= r.bottom)?.date ?? null;
}

/**
 * The week as a table: each day a row of large dish photos. Press and hold a dish, then drag it
 * to another day; tapping still opens its menu (which can also move it, for VoiceOver).
 */
export function WeekTable({
  days,
  entries,
  info,
  today,
  onAdd,
  onTap,
  onMove,
  onDragging,
}: {
  days: string[];
  entries: Entry[];
  info: (e: Entry) => { title: string; recipe: Recipe | null } | undefined;
  today: string;
  onAdd: (date: string, slot: MealSlot) => void;
  onTap: (e: Entry) => void;
  onMove: (e: Entry, date: string) => void;
  /** The page must stop scrolling while a dish is carried. */
  onDragging: (on: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const rowRefs = useRef(new Map<string, HostInstance | null>());
  const rows = useRef<{ date: string; top: number; bottom: number }[]>([]);
  // Window position of the table: the carried photo is drawn inside it.
  const base = useRef({ x: 0, y: 0 });
  const box = useRef<HostInstance>(null);
  const pos = useRef(new Animated.ValueXY()).current;
  const [drag, setDrag] = useState<{ entry: Entry; over: string | null } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const measureRows = () => {
    const out: typeof rows.current = [];
    for (const d of days)
      rowRefs.current.get(d)?.measureInWindow((x: number, y: number, w: number, h: number) => {
        out.push({ date: d, top: y, bottom: y + h });
        rows.current = [...out];
      });
  };

  const start = (entry: Entry, pageX: number, pageY: number) => {
    measureRows();
    box.current?.measureInWindow((x: number, y: number) => {
      base.current = { x, y };
      pos.setValue({ x: pageX - x - TILE / 2, y: pageY - y - TILE / 2 });
    });
    haptic.pickUp();
    onDragging(true);
    setDrag({ entry, over: entry.data.date });
  };

  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => !!dragRef.current,
    onMoveShouldSetPanResponder: () => !!dragRef.current,
    onMoveShouldSetPanResponderCapture: () => !!dragRef.current,
    onPanResponderTerminationRequest: () => !dragRef.current,
    onPanResponderMove: (e) => {
      const { pageX, pageY } = e.nativeEvent;
      pos.setValue({ x: pageX - base.current.x - TILE / 2, y: pageY - base.current.y - TILE / 2 });
      const over = dayAt(pageY, rows.current);
      if (dragRef.current && over && over !== dragRef.current.over) {
        haptic.tick();
        setDrag({ ...dragRef.current, over });
      }
    },
    onPanResponderRelease: () => finish(true),
    onPanResponderTerminate: () => finish(false),
  });

  const finish = (drop: boolean) => {
    const d = dragRef.current;
    setDrag(null);
    onDragging(false);
    if (drop && d?.over && d.over !== d.entry.data.date) {
      haptic.drop();
      onMove(d.entry, d.over);
    }
  };

  return (
    <View ref={box} {...responder.panHandlers} style={{ gap: space.md }}>
      <Text variant="caption" color="textMuted">
        {t('delight.plan.dragHint')}
      </Text>
      {days.map((d) => {
        const list = entries
          .filter((e) => e.data.date === d)
          .sort((a, b) => MEAL_SLOTS.indexOf(a.data.slot) - MEAL_SLOTS.indexOf(b.data.slot));
        const over = drag?.over === d && drag.entry.data.date !== d;
        return (
          <View
            key={d}
            ref={(v) => void rowRefs.current.set(d, v)}
            style={[
              styles.row,
              {
                backgroundColor: over ? colors.primarySoft : colors.surface,
                borderColor: over || d === today ? colors.primary : colors.line,
                borderWidth: over || d === today ? 1.5 : StyleSheet.hairlineWidth,
              },
            ]}
            testID={`table-day-${d}`}
          >
            <Text variant="title3" accessibilityRole="header">
              {dayLong(d, i18n.language)}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={!drag}>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {list.map((e) => {
                  const x = info(e);
                  const carried = drag?.entry.id === e.id;
                  return (
                    <Pressable
                      key={e.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${t(`slots.${e.data.slot}`)}: ${x?.title ?? ''}`}
                      accessibilityHint={t('planning.moveTo')}
                      onPress={() => onTap(e)}
                      onLongPress={(ev) => start(e, ev.nativeEvent.pageX, ev.nativeEvent.pageY)}
                      delayLongPress={280}
                      // VoiceOver: no dragging; the menu moves the dish to another day.
                      {...longPressActions(t('planning.moveTo'), () => onTap(e))}
                      style={{ width: TILE, opacity: carried ? 0.3 : 1 }}
                      testID="table-meal"
                    >
                      <RecipePhoto
                        uri={x?.recipe ? recipePhotoUri(x.recipe) : null}
                        category={x?.recipe?.data.category ?? null}
                        radius={radius.lg}
                        style={{ width: TILE, height: TILE }}
                        emojiSize={36}
                      />
                      <View style={[styles.slot, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                        <Text
                          variant="micro"
                          style={{ color: '#FFFCF6', textTransform: 'uppercase' }}
                        >
                          {t(`slots.${e.data.slot}`)}
                        </Text>
                      </View>
                      <Text
                        variant="caption"
                        weight="600"
                        numberOfLines={2}
                        style={{ marginTop: 4 }}
                      >
                        {x?.title}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('planning.addMeal')}, ${dayLong(d, i18n.language)}`}
                  onPress={() => onAdd(d, 'dinner')}
                  style={[styles.add, { borderColor: colors.line }]}
                >
                  <Icon name="add" size={26} color="textSubtle" />
                </Pressable>
              </View>
            </ScrollView>
          </View>
        );
      })}
      {drag ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.ghost, { transform: pos.getTranslateTransform() }]}
        >
          <RecipePhoto
            uri={info(drag.entry)?.recipe ? recipePhotoUri(info(drag.entry)!.recipe!) : null}
            category={info(drag.entry)?.recipe?.data.category ?? null}
            radius={radius.lg}
            style={{ width: TILE, height: TILE }}
            emojiSize={36}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radius.xl, padding: space.md, gap: space.sm },
  slot: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  add: {
    width: TILE,
    height: TILE,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: {
    position: 'absolute',
    top: 0,
    left: 0,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    transform: [{ scale: 1.08 }],
  },
});
