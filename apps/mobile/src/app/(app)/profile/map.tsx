import { ScrollView, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { CUISINE_COUNTRY, CUISINES, flagOf, type Cuisine } from '@pepperedapron/core';
import { kitchenHistory } from '../../../features/kitchen';
import { useLive } from '../../../hooks/runtime';
import { useLayout } from '../../../lib/layout';
import { COUNTRY_DOTS, gridOf, LAND, MAP_COLS, MAP_ROWS, MARKERS } from '../../../lib/worldMap';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import { Text } from '../../../ui';

/** The world map of cuisines cooked: their countries light up as the user cooks them. */
export default function CuisineMap() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const layout = useLayout();
  const cooked = useLive(['cookLog', 'recipe'], (r) => {
    const h = kitchenHistory(r);
    const n = new Map<Cuisine, number>();
    for (const l of h.logs) {
      const c = h.facts(l.recipeId)?.cuisine;
      if (c) n.set(c, (n.get(c) ?? 0) + 1);
    }
    return n;
  });
  const w = Math.min(layout.width, 900) - space.lg * 2;
  const cell = w / MAP_COLS;
  const h = cell * MAP_ROWS;
  const lit = new Set<number>();
  for (const [c] of cooked) for (const i of COUNTRY_DOTS[CUISINE_COUNTRY[c]] ?? []) lit.add(i);
  const sorted = [...CUISINES].sort(
    (a, b) => (cooked.get(b) ?? 0) - (cooked.get(a) ?? 0) || a.localeCompare(b),
  );
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: space.lg,
        gap: space.lg,
        maxWidth: 900,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      <View style={{ gap: 2 }}>
        <Text variant="kicker" color="accent">
          {t('delight.map.kicker')}
        </Text>
        <Text variant="lede" color="textMuted">
          {cooked.size
            ? t('delight.map.progress', { count: cooked.size, total: CUISINES.length })
            : t('delight.map.empty')}
        </Text>
      </View>
      <View
        style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.sm }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${t('delight.map.title')}: ${[...cooked.keys()].map((c) => t(`delight.cuisines.${c}`)).join(', ')}`}
        testID="cuisine-map"
      >
        <Svg width={w - space.sm * 2} height={h} viewBox={`0 0 ${w} ${h}`}>
          <G>
            {LAND.flatMap((row, r) =>
              [...row].map((ch, c) =>
                ch === '1' ? (
                  <Circle
                    key={r * MAP_COLS + c}
                    cx={(c + 0.5) * cell}
                    cy={(r + 0.5) * cell}
                    r={cell * (lit.has(r * MAP_COLS + c) ? 0.46 : 0.3)}
                    fill={lit.has(r * MAP_COLS + c) ? colors.accent : colors.line}
                  />
                ) : null,
              ),
            )}
            {[...cooked.keys()].map((c) => {
              const g = gridOf(MARKERS[CUISINE_COUNTRY[c]]!);
              return (
                <G key={c}>
                  <Circle
                    cx={(g.col + 0.5) * cell}
                    cy={(g.row + 0.5) * cell}
                    r={cell * 0.9}
                    fill={colors.primary}
                  />
                  <Circle
                    cx={(g.col + 0.5) * cell}
                    cy={(g.row + 0.5) * cell}
                    r={cell * 0.4}
                    fill={colors.onPrimary}
                  />
                </G>
              );
            })}
          </G>
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {sorted.map((c) => {
          const n = cooked.get(c) ?? 0;
          return (
            <View
              key={c}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                paddingVertical: space.sm,
                paddingHorizontal: space.md,
                borderRadius: radius.pill,
                backgroundColor: n ? colors.primarySoft : colors.surfaceMuted,
                opacity: n ? 1 : 0.7,
              }}
              accessible
              accessibilityLabel={`${t(`delight.cuisines.${c}`)}, ${n ? t('delight.map.cooked', { count: n }) : t('delight.map.notYet')}`}
            >
              <Text style={{ fontSize: 18 }} maxFontSizeMultiplier={1.2}>
                {flagOf(CUISINE_COUNTRY[c])}
              </Text>
              <Text
                variant="callout"
                weight={n ? '600' : '400'}
                color={n ? 'primary' : 'textMuted'}
              >
                {t(`delight.cuisines.${c}`)}
                {n ? ` · ${n}` : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
