import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  detectStepTimer,
  formatClock,
  scaleStepText,
  stepIngredients,
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
  checked: checkedProp,
  onToggle,
}: {
  ingredients: Ingredient[];
  factor: number;
  system: UnitSystem;
  checkable?: boolean;
  /** Controlled ticks (cook mode keeps them while the list is closed and reopened). */
  checked?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const [own, setOwn] = useState<Set<string>>(new Set());
  const checked = checkedProp ?? own;
  const toggle = (id: string) => {
    if (onToggle) return onToggle(id);
    setOwn((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
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
                toggle(ing.id);
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

/** The ingredients a step uses, with their quantities for the chosen number of servings. */
export function StepIngredients({
  text,
  ingredients,
  factor,
  system,
  large = false,
  checked,
  onToggle,
}: {
  text: string;
  ingredients: Ingredient[];
  factor: number;
  system: UnitSystem;
  large?: boolean;
  /** Cook mode: each ingredient can be ticked once it is weighed or added. */
  checked?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const used = stepIngredients(text, ingredients);
  if (!used.length) return null;
  const label = (i: Ingredient) => {
    const f = formatIngredient(i, factor, i18n.language as Locale, system);
    return [f.amount, f.name].filter(Boolean).join(' ');
  };
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}
      accessible={!onToggle}
      accessibilityLabel={
        onToggle ? undefined : `${t('cook.stepIngredients')} : ${used.map(label).join(', ')}`
      }
    >
      {used.map((i) => {
        const f = formatIngredient(i, factor, i18n.language as Locale, system);
        const done = checked?.has(i.id) ?? false;
        const chip = (
          <>
            {onToggle ? (
              <Icon
                name={done ? 'checkmark-circle' : 'ellipse-outline'}
                size={large ? 20 : 16}
                color="primary"
              />
            ) : null}
            {f.amount ? (
              <Text variant={large ? 'bodyStrong' : 'caption'} weight="700" color="primary">
                {f.amount}
              </Text>
            ) : null}
            <Text
              variant={large ? 'body' : 'caption'}
              color="primary"
              style={done ? { textDecorationLine: 'line-through' } : undefined}
            >
              {f.name}
            </Text>
          </>
        );
        const style = [
          styles.stepIng,
          { backgroundColor: colors.primarySoft, opacity: done ? 0.6 : 1 },
          large && { paddingVertical: 6, paddingHorizontal: 12 },
        ];
        return onToggle ? (
          <Pressable
            key={i.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={label(i)}
            onPress={() => {
              haptic.selection();
              onToggle(i.id);
            }}
            style={[style, { minHeight: 44, alignItems: 'center' }]}
          >
            {chip}
          </Pressable>
        ) : (
          <View key={i.id} style={style}>
            {chip}
          </View>
        );
      })}
    </View>
  );
}

export function StepList({
  steps,
  onTimer,
  factor = 1,
  ingredients = [],
  system = 'metric',
  notes = {},
  onNote,
}: {
  steps: Step[];
  onTimer?: (step: Step, index: number, seconds: number) => void;
  /** The user's notes by step id, shown under the step. */
  notes?: Record<string, string>;
  /** Write or change the note of a step. */
  onNote?: (step: Step, index: number) => void;
  /** Quantities written in the steps follow the chosen number of servings. */
  factor?: number;
  /** Shown under each step: the ones it uses. */
  ingredients?: Ingredient[];
  system?: UnitSystem;
}) {
  const { t, i18n } = useTranslation();
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
        // A step without a timer that says "cuire 8 min" still gets a timer button.
        const seconds = detectStepTimer(s);
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
                <Text variant="body">{scaleStepText(s.text, factor, i18n.language as Locale)}</Text>
                <StepIngredients
                  text={s.text}
                  ingredients={ingredients}
                  factor={factor}
                  system={system}
                />
                {seconds && onTimer ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('cook.startTimer', { time: formatClock(seconds) })}
                    onPress={() => onTimer(s, i, seconds)}
                    style={[styles.timerChip, { backgroundColor: colors.accentSoft }]}
                  >
                    <Icon name="timer-outline" size={16} color="accent" />
                    <Text variant="callout" color="accent" weight="600">
                      {s.timerLabel ?? t('recipe.timer', { time: formatClock(seconds) })}
                    </Text>
                  </Pressable>
                ) : null}
                {notes[s.id] ? (
                  <Pressable
                    accessibilityRole={onNote ? 'button' : undefined}
                    accessibilityLabel={`${t('delight.stepNote')}: ${notes[s.id]}`}
                    onPress={onNote ? () => onNote(s, i) : undefined}
                    style={[
                      styles.stepNote,
                      { borderLeftColor: colors.accent, backgroundColor: colors.accentSoft },
                    ]}
                    testID={`step-note-${i}`}
                  >
                    <Text variant="quote">{notes[s.id]}</Text>
                  </Pressable>
                ) : onNote ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onNote(s, i)}
                    hitSlop={8}
                    style={styles.addNote}
                    testID={`step-add-note-${i}`}
                  >
                    <Icon name="create-outline" size={14} color="textSubtle" />
                    <Text variant="caption" color="textSubtle">
                      {t('delight.addStepNote')}
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
  stepNote: {
    borderLeftWidth: 3,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  addNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    minHeight: 32,
  },
  stepIng: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'baseline',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
  },
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
