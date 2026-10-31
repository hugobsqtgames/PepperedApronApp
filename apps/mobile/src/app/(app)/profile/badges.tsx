import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BadgeId } from '@pepperedapron/core';
import { badgesOf } from '../../../features/kitchen';
import { useLive } from '../../../hooks/runtime';
import { dayMonth } from '../../../lib/dates';
import { useLayout } from '../../../lib/layout';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import { Text } from '../../../ui';

export const BADGE_EMOJI: Record<BadgeId, string> = {
  firstCook: '🍳',
  cooks10: '🔥',
  cooks50: '🥈',
  cooks100: '🥇',
  explorer25: '🧭',
  veggie10: '🥕',
  fish5: '🐟',
  baker10: '🧁',
  quick10: '⚡',
  seasonal10: '🍓',
  world5: '✈️',
  world10: '🌍',
  photographer10: '📸',
  streak4: '📅',
};

/** Kitchen badges: won ones in colour with their date, the others with their progress. */
export default function Badges() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const layout = useLayout();
  const badges = useLive(['cookLog', 'recipe'], (r) => badgesOf(r));
  const won = badges.filter((b) => b.wonOn).length;
  const cols = layout.isTablet ? 3 : 2;
  const w = (Math.min(layout.width, 900) - space.lg * 2 - space.md * (cols - 1)) / cols;
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
      <Text variant="lede" color="textMuted">
        {t('delight.badges.count', { won, total: badges.length })}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        {badges.map((b) => {
          const name = t(`delight.badges.items.${b.id}.title`);
          const body = t(`delight.badges.items.${b.id}.body`);
          const status = b.wonOn
            ? t('delight.badges.wonOn', { date: dayMonth(b.wonOn, i18n.language) })
            : t('delight.badges.progress', { n: b.progress, target: b.target });
          return (
            <View
              key={b.id}
              accessible
              accessibilityLabel={`${name}. ${body}. ${status}`}
              testID={`badge-${b.id}`}
              style={{
                width: w,
                gap: space.xs,
                padding: space.lg,
                borderRadius: radius.xl,
                backgroundColor: b.wonOn ? colors.accentSoft : colors.surface,
                borderWidth: 1,
                borderColor: b.wonOn ? colors.accent : colors.line,
              }}
            >
              <Text style={{ fontSize: 40, opacity: b.wonOn ? 1 : 0.35 }} maxFontSizeMultiplier={1}>
                {BADGE_EMOJI[b.id]}
              </Text>
              <Text variant="bodyStrong">{name}</Text>
              <Text variant="caption" color="textMuted">
                {body}
              </Text>
              {b.wonOn ? null : (
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.line,
                    overflow: 'hidden',
                    marginTop: space.xs,
                  }}
                >
                  <View
                    style={{
                      width: `${(b.progress / b.target) * 100}%`,
                      height: '100%',
                      backgroundColor: colors.accent,
                    }}
                  />
                </View>
              )}
              <Text variant="caption" color={b.wonOn ? 'accent' : 'textSubtle'} weight="600">
                {status}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
