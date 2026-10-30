import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
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
import * as Speech from 'expo-speech';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  detectStepTimer,
  EMPTY_FILTERS,
  formatClock,
  scaleStepText,
  searchRecipes,
  stepIngredients,
  timerState,
  voiceCommand,
  type KitchenTimer,
  type Locale,
  type VoiceCommand,
} from '@pepperedapron/core';
import {
  onSpeech,
  startListening,
  stopListening,
  voiceCommandsAvailable,
} from '../../../../../modules/voice-commands';
import { IngredientList, StepIngredients } from '../../../../features/recipe/RecipeBody';
import { clearActivity, setActivity } from '../../../../../modules/ios-integration';
import { useLive, useRepos } from '../../../../hooks/runtime';
import { useLayout } from '../../../../lib/layout';
import { haptic } from '../../../../services/haptics';
import { maybeAskForReview } from '../../../../services/appMoments';
import { timers } from '../../../../services/timers';
import { useTheme } from '../../../../theme/ThemeProvider';
import { radius, space } from '../../../../theme/tokens';
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  Stars,
  Text,
  TextField,
  useActionSheet,
  usePrompt,
  useToast,
} from '../../../../ui';

const TIMER_PRESETS = [1, 3, 5, 10, 15, 20, 30, 45, 60];
const TEXT_SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.75];

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
  const { id, servings } = useLocalSearchParams<{ id: string; servings?: string }>();
  const { t, i18n } = useTranslation();
  const repos = useRepos();
  const sheet = useActionSheet();
  const prompt = usePrompt();
  const { colors, a11y } = useTheme();
  const layout = useLayout();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  // Several recipes can be cooked at once (a main and a side): one tab each, each at its step.
  const [ids, setIds] = useState<string[]>([id]);
  const [active, setActive] = useState(id);
  const [indexes, setIndexes] = useState<Record<string, number>>({});
  const { recipes, settings } = useLive(
    ['recipe', 'settings'],
    (r) => ({ recipes: ids.map((x) => r.recipe(x)), settings: r.settings() }),
    [ids.join(',')],
  );
  const recipe = recipes.find((r) => r?.id === active) ?? null;
  const index = indexes[active] ?? 0;
  const setIndex = (n: number) => setIndexes((m) => ({ ...m, [active]: n }));
  const [done, setDone] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);
  const [adding, setAdding] = useState(false);
  const [listening, setListening] = useState(false);
  const list = useRef<FlatList>(null);
  const running = useTimers();
  const readAloud = settings.cookReadAloud;
  const speechLang = i18n.language.startsWith('en') ? 'en-US' : 'fr-FR';
  // While the phone speaks, the microphone hears it: what is recognised then is ignored.
  const speakingUntil = useRef(0);
  const handledPhrase = useRef(-1);
  const onCommand = useRef<(c: VoiceCommand) => void>(() => undefined);

  const speak = (text: string) => {
    void Speech.stop();
    speakingUntil.current = Date.now() + 60_000;
    Speech.speak(text, {
      language: speechLang,
      rate: 0.95,
      onDone: () => {
        speakingUntil.current = Date.now() + 700;
      },
      onStopped: () => {
        speakingUntil.current = Date.now() + 700;
      },
      onError: () => {
        speakingUntil.current = 0;
      },
    });
  };
  const stepSpeech = (i: number) => {
    const s = recipe?.data.steps[i];
    if (!s || !recipe) return '';
    const f = Number(servings) > 0 && active === id ? Number(servings) / recipe.data.servings : 1;
    return `${t('recipe.stepN', { n: i + 1 })}. ${scaleStepText(s.text, f, i18n.language as Locale)}`;
  };

  // Read each step aloud when it is shown (setting), and stop talking when leaving.
  useEffect(() => {
    if (readAloud && !done) speak(stepSpeech(index));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readAloud, index, active, done]);
  useEffect(() => () => void Speech.stop(), []);
  // VoiceOver: the new step is read when it changes (unless it is already read aloud).
  useEffect(() => {
    if (a11y.screenReader && !readAloud && !done) {
      const text = stepSpeech(index);
      if (text) AccessibilityInfo.announceForAccessibility(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, active]);
  // Handoff: the cook mode of this recipe continues on the other device.
  const handoffTitle = recipe?.data.title;
  useEffect(() => {
    if (!handoffTitle) return;
    setActivity('cook', handoffTitle, `pepperedapron://recipe/${active}/cook`);
    return () => clearActivity();
  }, [active, handoffTitle]);

  // Voice commands: only while turned on, in cook mode; listening stops when leaving.
  useEffect(() => {
    if (!listening) return;
    const off = onSpeech((text, phrase) => {
      if (phrase === handledPhrase.current || Date.now() < speakingUntil.current) return;
      const cmd = voiceCommand(text);
      if (!cmd) return;
      handledPhrase.current = phrase;
      onCommand.current(cmd);
    });
    return () => {
      off();
      void stopListening();
    };
  }, [listening]);

  const toggleListening = async () => {
    if (listening) return setListening(false);
    try {
      await startListening(speechLang);
      haptic.success();
      setListening(true);
      toast(t('cook.voiceOnHint'), { tone: 'info' });
    } catch (e) {
      const code = (e as { code?: string }).code;
      toast(
        code === 'ERR_PERMISSION'
          ? t('cook.voicePermission')
          : code === 'ERR_LANGUAGE'
            ? t('cook.voiceLanguage')
            : t('cook.voiceFailed'),
        { tone: 'error' },
      );
    }
  };

  const others = useMemo(
    () => recipes.filter((r): r is NonNullable<typeof r> => !!r && r.id !== active),
    [recipes, active],
  );

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
  // The number of servings chosen on the recipe: quantities follow, in the steps too.
  const people = Number(servings) > 0 && recipe.id === id ? Number(servings) : recipe.data.servings;
  const factor = people / recipe.data.servings;
  const scale = settings.cookTextScale;
  const setScale = (dir: 1 | -1) => {
    const i = TEXT_SCALES.findIndex((x) => x >= scale - 0.01);
    const next = TEXT_SCALES[Math.max(0, Math.min(TEXT_SCALES.length - 1, i + dir))]!;
    if (next !== scale) void repos.updateSettings({ cookTextScale: next });
  };

  /** A timer of its own ("pasta", "sauce"): pick a duration, then name it. */
  const newTimer = () =>
    sheet({
      title: t('cook.newTimer'),
      options: TIMER_PRESETS.map((m) => ({
        label: t('common.minutes', { count: m }),
        icon: 'timer-outline' as const,
        onPress: () =>
          setTimeout(
            () =>
              prompt({
                title: t('cook.timerName'),
                placeholder: t('cook.timerNamePlaceholder'),
                initial: `${t('cook.timerLabel')} ${m} min`,
                maxLength: 40,
                confirm: t('cook.startTimer', { time: formatClock(m * 60) }),
                onSubmit: (label) =>
                  void timers.start({ label, seconds: m * 60, recipeId: recipe.id }),
              }),
            350,
          ),
      })),
    });
  const paneWidth = layout.wide ? width * 0.62 : width;

  const go = (i: number) => {
    const n = Math.max(0, Math.min(total - 1, i));
    if (n === index) return;
    haptic.light();
    setIndex(n);
    list.current?.scrollToIndex({ index: n, animated: true });
  };
  const startTimer = (i: number) => {
    const s = steps[i];
    const seconds = s ? detectStepTimer(s) : null;
    if (!s || !seconds) return false;
    void timers.start({
      label: s.timerLabel ?? `${recipe.data.title} · ${t('recipe.stepN', { n: i + 1 })}`,
      seconds,
      recipeId: recipe.id,
      stepIndex: i,
    });
    haptic.success();
    return true;
  };
  const finish = () => {
    haptic.success();
    // Cooking history: one entry per recipe and day.
    void repos.logCooked(recipe.id);
    // Another recipe still cooking: carry on with it.
    const next = others[0];
    if (next) {
      setIds((l) => l.filter((x) => x !== recipe.id));
      setActive(next.id);
      toast(t('cook.recipeDone', { title: recipe.data.title }));
      return;
    }
    setDone(true);
  };
  const switchTo = (rid: string) => {
    if (rid === active) return;
    haptic.light();
    setActive(rid);
  };
  const addRecipe = (rid: string) => {
    setAdding(false);
    if (!ids.includes(rid)) setIds((l) => [...l, rid]);
    setActive(rid);
  };
  onCommand.current = (cmd) => {
    haptic.light();
    if (cmd === 'next') {
      if (index < total - 1) go(index + 1);
      else speak(t('cook.lastStep'));
    } else if (cmd === 'previous') go(index - 1);
    else if (cmd === 'repeat') speak(stepSpeech(index));
    else if (cmd === 'timer') {
      if (!startTimer(index)) speak(t('cook.noTimer'));
    } else if (cmd === 'ingredients') {
      const used = stepIngredients(steps[index]?.text ?? '', recipe.data.ingredients);
      if (!layout.wide) setShowIngredients(true);
      speak(
        used.length
          ? used.map((x) => x.name).join(', ')
          : recipe.data.ingredients.map((x) => x.name).join(', '),
      );
    } else if (cmd === 'stop') void Speech.stop();
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
            prompt({
              title: t('recipe.personalNote'),
              message: t('recipe.personalNoteHint'),
              initial: recipe.data.personalNote ?? '',
              multiline: true,
              maxLength: 2000,
              allowEmpty: true,
              onSubmit: (v) => void repos.setPersonalNote(recipe.id, v || null),
            })
          }
          secondary={t('common.close')}
          onSecondary={() => router.back()}
        />
        <View style={{ alignItems: 'center', gap: space.sm }}>
          <Text variant="callout" color="textMuted">
            {t('cook.rate')}
          </Text>
          <Stars
            value={recipe.data.rating}
            onChange={(v) => {
              void repos.setRating(recipe.id, v);
              // A happy moment: the only place the App Store rating is ever asked.
              void maybeAskForReview(v);
            }}
            size={36}
          />
          <Text variant="caption" color="textMuted">
            {t('history.loggedAuto')}
          </Text>
        </View>
      </View>
    );
  }

  const ingredientsPanel = (
    <View style={{ gap: space.md }}>
      <Text variant="callout" color="textMuted">
        {t('cook.forPeople', { count: people })}
      </Text>
      <IngredientList
        ingredients={recipe.data.ingredients}
        factor={factor}
        system={settings.unitSystem}
      />
    </View>
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
          <Text variant="caption" color="textMuted" align="center">
            {t('cook.screenOn')}
          </Text>
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
      {ids.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}
          style={{ flexGrow: 0, paddingBottom: space.sm }}
          accessibilityRole="tablist"
        >
          {recipes.map((r) =>
            r ? (
              <Pressable
                key={r.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: r.id === active }}
                onPress={() => switchTo(r.id)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: r.id === active ? colors.primary : colors.surface,
                    borderColor: colors.line,
                  },
                ]}
              >
                <Text
                  variant="callout"
                  weight="600"
                  numberOfLines={1}
                  style={{ color: r.id === active ? colors.onPrimary : colors.text, maxWidth: 180 }}
                >
                  {r.data.title}
                </Text>
                <Text
                  variant="caption"
                  style={{ color: r.id === active ? colors.onPrimary : colors.textMuted }}
                >
                  {t('cook.stepShort', {
                    n: (indexes[r.id] ?? 0) + 1,
                    total: r.data.steps.length,
                  })}
                </Text>
              </Pressable>
            ) : null,
          )}
        </ScrollView>
      ) : null}
      {listening ? (
        <View
          style={[styles.listening, { backgroundColor: colors.accentSoft }]}
          accessibilityLiveRegion="polite"
        >
          <Icon name="mic" size={18} color="accent" />
          <Text variant="caption" style={{ flex: 1 }}>
            {t('cook.listening')}
          </Text>
        </View>
      ) : null}

      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: paneWidth }}>
          <FlatList
            key={active}
            ref={list}
            data={steps}
            initialScrollIndex={Math.min(index, Math.max(total - 1, 0))}
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
                  style={{ fontSize: 30 * scale, lineHeight: 42 * scale }}
                  accessibilityLabel={`${t('recipe.stepN', { n: i + 1 })}. ${item.text}`}
                >
                  {scaleStepText(item.text, factor, i18n.language as Locale)}
                </Text>
                <StepIngredients
                  text={item.text}
                  ingredients={recipe.data.ingredients}
                  factor={factor}
                  system={settings.unitSystem}
                  large
                />
                {detectStepTimer(item) ? (
                  <Button
                    title={t('cook.startTimer', { time: formatClock(detectStepTimer(item)!) })}
                    icon="timer-outline"
                    variant="accent"
                    size="lg"
                    onPress={() => void startTimer(i)}
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

      <View style={styles.tools}>
        <IconButton icon="remove" label={t('cook.smallerText')} onPress={() => setScale(-1)} />
        <Text variant="bodyStrong" accessibilityElementsHidden>
          Aa
        </Text>
        <IconButton icon="add" label={t('cook.biggerText')} onPress={() => setScale(1)} />
        <IconButton
          icon={readAloud ? 'volume-high' : 'volume-mute-outline'}
          label={readAloud ? t('cook.readAloudOff') : t('cook.readAloudOn')}
          variant={readAloud ? 'primary' : 'surface'}
          onPress={() => {
            if (readAloud) void Speech.stop();
            void repos.updateSettings({ cookReadAloud: !readAloud });
          }}
          testID="cook-read-aloud"
        />
        {voiceCommandsAvailable ? (
          <IconButton
            icon={listening ? 'mic' : 'mic-outline'}
            label={listening ? t('cook.voiceOff') : t('cook.voiceOn')}
            variant={listening ? 'primary' : 'surface'}
            onPress={() => void toggleListening()}
            testID="cook-voice"
          />
        ) : null}
        <IconButton
          icon="albums-outline"
          label={t('cook.addRecipe')}
          onPress={() => setAdding(true)}
          testID="cook-add-recipe"
        />
        <View style={{ flex: 1 }} />
        <Button
          title={t('cook.newTimer')}
          icon="timer-outline"
          variant="secondary"
          size="sm"
          onPress={newTimer}
          testID="cook-new-timer"
        />
      </View>
      {running.length ? <TimerTray timers={running} /> : null}

      <View
        style={[
          styles.nav,
          { paddingBottom: insets.bottom + space.md },
          // Accessibility text sizes: the two big buttons go one above the other.
          layout.largeText && { flexDirection: 'column-reverse' },
        ]}
      >
        <Button
          title={t('cook.previous')}
          icon="arrow-back"
          variant="secondary"
          size="lg"
          disabled={index === 0}
          onPress={() => go(index - 1)}
          style={{ flex: layout.largeText ? undefined : 1, minHeight: 64 }}
        />
        {index < total - 1 ? (
          <Button
            title={t('cook.next')}
            icon="arrow-forward"
            size="lg"
            onPress={() => go(index + 1)}
            style={{ flex: layout.largeText ? undefined : 1.4, minHeight: 64 }}
            testID="cook-next"
          />
        ) : (
          <Button
            title={t('cook.finish')}
            icon="checkmark"
            variant="accent"
            size="lg"
            onPress={finish}
            style={{ flex: layout.largeText ? undefined : 1.4, minHeight: 64 }}
            testID="cook-finish"
          />
        )}
      </View>

      <Modal
        visible={showIngredients}
        animationType={a11y.reduceMotion ? 'fade' : 'slide'}
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
      <Modal
        visible={adding}
        animationType={a11y.reduceMotion ? 'fade' : 'slide'}
        presentationStyle="pageSheet"
        onRequestClose={() => setAdding(false)}
      >
        <AddRecipeSheet exclude={ids} onPick={addRecipe} onClose={() => setAdding(false)} />
      </Modal>
    </View>
  );
}

/** Choose a second recipe to cook at the same time (a side, a dessert). */
function AddRecipeSheet({
  exclude,
  onPick,
  onClose,
}: {
  exclude: string[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const items = useLive(['recipe'], (r) => r.searchable(r.library()));
  const results = (
    query.trim() ? searchRecipes(items, query, EMPTY_FILTERS).map((x) => x.recipe) : items
  )
    .map((r) => r.record)
    .filter((r) => !exclude.includes(r.id) && r.data.steps.length);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.top, { paddingTop: space.lg }]}>
        <Text variant="title2" style={{ flex: 1 }} accessibilityRole="header">
          {t('cook.addRecipe')}
        </Text>
        <IconButton icon="close" label={t('common.close')} onPress={onClose} />
      </View>
      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
        <Text variant="callout" color="textMuted">
          {t('cook.addRecipeHint')}
        </Text>
        <TextField
          icon="search"
          placeholder={t('search.placeholder')}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      </View>
      <FlatList
        data={results}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: space.lg }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => onPick(item.id)}
            style={({ pressed }) => [
              styles.pickRow,
              { borderBottomColor: colors.line, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text variant="body" style={{ flex: 1 }} numberOfLines={2}>
              {item.data.title}
            </Text>
            <Text variant="caption" color="textMuted">
              {t('cook.stepsCount', { count: item.data.steps.length })}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState emoji="🔎" title={t('search.noResultsTitle')} />}
      />
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
  tab: {
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  listening: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nav: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
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
