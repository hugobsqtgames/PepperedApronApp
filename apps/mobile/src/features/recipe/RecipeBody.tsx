import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  formatClock,
  type Ingredient,
  type Locale,
  type Step,
  type UnitSystem,
} from '@pepperedapron/core';
import { formatIngredient } from '../../lib/format';
import { haptic } from '../../services/haptics';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Icon, Text } from '../../ui';

export function IngredientList({
  ingredients,
  factor,
  system,
  checkable = true,
}: {
  ingredients: Ingredient[];
  factor: number;
  system: UnitSystem;
  checkable?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  if (!ingredients.length) {
    return (
      <Text color="textMuted" variant="callout">
        {t('recipe.noIngredients')}
      </Text>
    );
  }
  let group: string | null = null;
  return (
    <View style={{ gap: 2 }}>
      {ingredients.map((ing) => {
        const header = ing.group && ing.group !== group ? ing.group : null;
        group = ing.group;
        const f = formatIngredient(ing, factor, i18n.language as Locale, system);
        const done = checked.has(ing.id);
        return (
          <View key={ing.id}>
            {header ? (
              <Text
                variant="bodyStrong"
                color="accent"
                style={{ marginTop: space.md, marginBottom: space.xs }}
              >
                {header}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole={checkable ? 'checkbox' : 'text'}
              accessibilityState={checkable ? { checked: done } : undefined}
              accessibilityLabel={[f.amount, f.name, f.note].filter(Boolean).join(' ')}
              disabled={!checkable}
              onPress={() => {
                haptic.selection();
                setChecked((s) => {
                  const n = new Set(s);
                  if (n.has(ing.id)) n.delete(ing.id);
                  else n.add(ing.id);
                  return n;
                });
              }}
              style={[styles.ingRow, { borderBottomColor: colors.line }]}
            >
              {checkable ? (
                <Icon
                  name={done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  tint={done ? colors.primary : colors.line}
                />
              ) : null}
              <Text
                variant="body"
                style={{
                  flex: 1,
                  opacity: done ? 0.45 : 1,
                  textDecorationLine: done ? 'line-through' : 'none',
                }}
              >
                {f.amount ? <Text variant="bodyStrong">{f.amount} </Text> : null}
                {f.name}
                {f.note ? <Text color="textMuted"> — {f.note}</Text> : null}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

export function StepList({
  steps,
  onTimer,
}: {
  steps: Step[];
  onTimer?: (step: Step, index: number) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!steps.length) {
    return (
      <Text color="textMuted" variant="callout">
        {t('recipe.noSteps')}
      </Text>
    );
  }
  let group: string | null = null;
  return (
    <View style={{ gap: space.lg }}>
      {steps.map((s, i) => {
        const header = s.group && s.group !== group ? s.group : null;
        group = s.group;
        return (
          <View key={s.id} style={{ gap: space.sm }}>
            {header ? (
              <Text variant="bodyStrong" color="accent">
                {header}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <View style={[styles.stepNum, { backgroundColor: colors.primarySoft }]}>
                <Text variant="bodyStrong" color="primary">
                  {i + 1}
                </Text>
              </View>
              <View style={{ flex: 1, gap: space.sm }}>
                <Text variant="body">{s.text}</Text>
                {s.timerSeconds && onTimer ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('cook.startTimer', { time: formatClock(s.timerSeconds) })}
                    onPress={() => onTimer(s, i)}
                    style={[styles.timerChip, { backgroundColor: colors.accentSoft }]}
                  >
                    <Icon name="timer-outline" size={16} color="accent" />
                    <Text variant="callout" color="accent" weight="600">
                      {s.timerLabel ?? t('recipe.timer', { time: formatClock(s.timerSeconds) })}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function TextBlock({
  title,
  text,
  icon,
}: {
  title: string;
  text: string | null;
  icon?: 'bulb-outline' | 'document-text-outline' | 'information-circle-outline';
}) {
  const { colors } = useTheme();
  if (!text) return null;
  return (
    <View
      style={[
        styles.block,
        { backgroundColor: icon === 'bulb-outline' ? colors.accentSoft : colors.surfaceMuted },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {icon ? (
          <Icon name={icon} size={18} color={icon === 'bulb-outline' ? 'accent' : 'textMuted'} />
        ) : null}
        <Text variant="title3">{title}</Text>
      </View>
      <Text variant="body">{text}</Text>
    </View>
  );
}

export function SourceLink({ source, url }: { source: string | null; url: string | null }) {
  const { t } = useTranslation();
  if (!source && !url) return null;
  return (
    <Pressable
      disabled={!url}
      accessibilityRole={url ? 'link' : 'text'}
      onPress={() => url && void Linking.openURL(url)}
      style={{
        flexDirection: 'row',
        gap: space.sm,
        alignItems: 'center',
        paddingVertical: space.sm,
      }}
    >
      <Icon name="link-outline" size={18} color="textMuted" />
      <Text
        variant="callout"
        color={url ? 'primary' : 'textMuted'}
        numberOfLines={2}
        style={{ flex: 1 }}
      >
        {t('recipe.source')} : {source ?? url}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  block: { gap: space.sm, padding: space.lg, borderRadius: radius.xl },
});
