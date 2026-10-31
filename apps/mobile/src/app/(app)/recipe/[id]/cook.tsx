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
  parallelSteps,
  formatClock,
  scaleStepText,
  stepIngredients,
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
import { TintScope, useTheme } from '../../../../theme/ThemeProvider';
import { useDishColor } from '../../../../lib/photoTint';
import { recipePhotoUri } from '../../../../lib/media';
import { useCookCelebration } from '../../../../features/celebrate';
import { TimerRings } from '../../../../features/cook/TimerRings';
import { CookPlanView } from '../../../../features/cook/CookPlanView';
import { RecipePicker } from '../../../../features/cook/RecipePicker';
import { pickImage, preparePhoto, type PhotoSource } from '../../../../services/photos';
import { errorMessage, inBackground } from '../../../../lib/errors';
import { radius, space } from '../../../../theme/tokens';
import {
  Button,
  ConfettiProvider,
  EmptyState,
  Icon,
  IconButton,
  Stars,
  Text,
  ToastProvider,
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

/** Cook mode takes on the colour of the dish, like its recipe page. */
export default function CookMode() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const look = useLive(
    ['recipe'],
    (r) => {
      const x = r.recipe(id);
      return x ? { uri: recipePhotoUri(x), category: x.data.category } : null;
    },
    [id],
  );
  const color = useDishColor(look?.uri ?? null, look?.category ?? null);
  // Cook mode is a full-screen modal, above the app's own confetti and toasts: it has its own.
  return (
    <TintScope color={color}>
      <ConfettiProvider>
        <ToastProvider>
          <CookModeBody />
        </ToastProvider>
      </ConfettiProvider>
    </TintScope>
  );
}

function CookModeBody() {
  useKeepAwake();
  const params = useLocalSearchParams<{ id: string; servings?: string; with?: string }>();
  const { id, servings } = params;
  const celebrate = useCookCelebration();
  const [photoAsked, setPhotoAsked] = useState(false);
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
  // Several recipes from the start: a meal or a batch planned on the plan screen.
  const [ids, setIds] = useState<string[]>(() => [
    ...new Set([id, ...(params.with ?? '').split(',').filter(Boolean)]),
  ]);
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
  const [showPlan, setShowPlan] = useState(false);
  // Ingredients ticked while cooking, per recipe: kept when the list is closed and reopened.
  const [ticked, setTicked] = useState<Record<string, string[]>>({});
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
  const checked = new Set(ticked[recipe.id] ?? []);
  const toggleIngredient = (ingId: string) =>
    setTicked((m) => {
      const cur = m[recipe.id] ?? [];
      return {
        ...m,
        [recipe.id]: cur.includes(ingId) ? cur.filter((x) => x !== ingId) : [...cur, ingId],
      };
    });
  const ingredientCount = recipe.data.ingredients.length;
  // The number of servings chosen on the recipe: quantities follow, in the steps too.
  const people = Number(servings) > 0 && recipe.id === id ? Number(servings) : recipe.data.servings;
  const factor = people / recipe.data.servings;
  const scale = settings.cookTextScale;
  const setScale = (dir: 1 | -1) => {
    const i = TEXT_SCALES.findIndex((x) => x >= scale - 0.01);
    const next = TEXT_SCALES[Math.max(0, Math.min(TEXT_SCALES.length - 1, i + dir))]!;
    if (next !== scale) inBackground(repos.updateSettings({ cookTextScale: next }));
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
    haptic.tick();
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
    // Cooking history: one entry per recipe and day (celebrated when it is worth it).
    void celebrate(() => repos.logCooked(recipe.id)).catch(() => undefined);
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

  /** "My result": the photo of the dish, on today's entry of the cooking journal. */
  const resultPhoto = async (source: PhotoSource) => {
    try {
      const r = await pickImage(source);
      if (!r || 'denied' in r) {
        if (r)
          toast(t(source === 'camera' ? 'errors.cameraPermission' : 'errors.photoPermission'), {
            tone: 'error',
          });
        return;
      }
      const key = await preparePhoto(r.uri);
      await celebrate(async () => {
        const log = await repos.logCooked(recipe.id);
        await repos.setCookPhoto(log.id, key);
      });
      setPhotoAsked(true);
      toast(t('delight.cook.photoSaved'));
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  if (done && !photoAsked) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingHorizontal: space.xxl,
          justifyContent: 'center',
          gap: space.lg,
        }}
        testID="cook-result"
      >
        <Text style={{ fontSize: 64, textAlign: 'center' }} maxFontSizeMultiplier={1}>
          📸
        </Text>
        <Text variant="title1" align="center" accessibilityRole="header">
          {t('delight.cook.resultTitle')}
        </Text>
        <Text variant="lede" color="textMuted" align="center">
          {t('delight.cook.resultBody')}
        </Text>
        <View style={{ gap: space.sm, marginTop: space.md }}>
          <Button
            title={t('delight.cook.takePhoto')}
            icon="camera"
            size="lg"
            full
            onPress={() => void resultPhoto('camera')}
            testID="cook-result-camera"
          />
          <Button
            title={t('delight.cook.choosePhoto')}
            icon="images-outline"
            variant="secondary"
            size="lg"
            full
            onPress={() => void resultPhoto('library')}
          />
          <Button
            title={t('delight.cook.later')}
            variant="ghost"
            full
            onPress={() => setPhotoAsked(true)}
            testID="cook-result-later"
          />
        </View>
      </View>
    );
  }

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
              onSubmit: (v) => inBackground(repos.setPersonalNote(recipe.id, v || null)),
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
              inBackground(repos.setRating(recipe.id, v));
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
        {ingredientCount
          ? `  ·  ${t('cook.ticked', { n: checked.size, total: ingredientCount })}`
          : ''}
      </Text>
      <IngredientList
        ingredients={recipe.data.ingredients}
        factor={factor}
        system={settings.unitSystem}
        checked={checked}
        onToggle={toggleIngredient}
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
            icon={checked.size && checked.size === ingredientCount ? 'checkbox' : 'list-outline'}
            label={`${t('cook.ingredients')}, ${t('cook.ticked', { n: checked.size, total: ingredientCount })}`}
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
                haptic.tick();
                setIndex(i);
              }
            }}
            renderItem={({ item, index: i }) => (
              <ScrollView
                style={{ width: paneWidth }}
                contentContainerStyle={{ padding: space.xxl, gap: space.xl }}
              >
                <Text variant="kicker" color="accent">
                  {item.group
                    ? `${t('delight.cook.stepOf', { n: i + 1, total })}  ·  ${item.group}`
                    : t('delight.cook.stepOf', { n: i + 1, total })}
                </Text>
                <Text
                  variant="cook"
                  maxFontSizeMultiplier={1.6}
                  style={{ fontSize: 30 * scale, lineHeight: 42 * scale }}
                  accessibilityLabel={`${t('recipe.stepN', { n: i + 1 })}. ${item.text}`}
                >
                  {scaleStepText(item.text, factor, i18n.language as Locale)}
                </Text>
                {recipe.data.stepNotes[item.id] ? (
                  <View
                    style={[
                      styles.note,
                      { borderLeftColor: colors.accent, backgroundColor: colors.accentSoft },
                    ]}
                    accessible
                    accessibilityLabel={`${t('delight.stepNote')}: ${recipe.data.stepNotes[item.id]}`}
                  >
                    <Text variant="kicker" color="accent">
                      {t('delight.stepNote')}
                    </Text>
                    <Text variant="quote" style={{ fontSize: 19 * scale, lineHeight: 27 * scale }}>
                      {recipe.data.stepNotes[item.id]}
                    </Text>
                  </View>
                ) : null}
                <StepIngredients
                  text={item.text}
                  ingredients={recipe.data.ingredients}
                  factor={factor}
                  system={settings.unitSystem}
                  large
                  checked={checked}
                  onToggle={toggleIngredient}
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
                <WhileItCooks steps={steps} index={i} factor={factor} onGo={(n) => go(n)} />
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
            inBackground(repos.updateSettings({ cookReadAloud: !readAloud }));
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
        {ids.length > 1 ? (
          <IconButton
            icon="git-network-outline"
            label={t('plan.mealTitle')}
            onPress={() => setShowPlan(true)}
            testID="cook-plan"
          />
        ) : null}
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
      {running.length ? <TimerRings list={running} /> : null}

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
        <RecipePicker
          title={t('cook.addRecipe')}
          hint={t('cook.addRecipeHint')}
          exclude={ids}
          onPick={addRecipe}
          onClose={() => setAdding(false)}
        />
      </Modal>
      <Modal
        visible={showPlan}
        animationType={a11y.reduceMotion ? 'fade' : 'slide'}
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPlan(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[styles.top, { paddingTop: space.lg }]}>
            <Text variant="title2" style={{ flex: 1 }} accessibilityRole="header">
              {t('plan.mealTitle')}
            </Text>
            <IconButton icon="close" label={t('common.close')} onPress={() => setShowPlan(false)} />
          </View>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
            <Text variant="callout" color="textMuted">
              {t('plan.mealHint')}
            </Text>
            <CookPlanView
              recipes={recipes.filter((r): r is NonNullable<typeof r> => !!r)}
              mode="together"
              onOpenStep={(item) => {
                setShowPlan(false);
                setActive(item.recipeId);
                setIndexes((m) => ({ ...m, [item.recipeId]: item.stepIndex }));
              }}
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

/**
 * "Pendant que ça cuit…": during a step that bakes, simmers or rests, the next preparation steps
 * that can be done meanwhile, one tap away.
 */
function WhileItCooks({
  steps,
  index,
  factor,
  onGo,
}: {
  steps: { id: string; text: string; timerSeconds: number | null }[];
  index: number;
  factor: number;
  onGo: (n: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const next = parallelSteps(steps, index);
  if (!next.length) return null;
  return (
    <View style={[styles.while, { backgroundColor: colors.primarySoft }]} testID="while-it-cooks">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="hourglass-outline" size={20} color="primary" />
        <Text variant="title3" color="primary">
          {t('delight.cook.whileCooking')}
        </Text>
      </View>
      <Text variant="callout" color="textMuted">
        {t('delight.cook.whileHint')}
      </Text>
      {next.map(({ index: n, step }) => (
        <Pressable
          key={step.id}
          accessibilityRole="button"
          accessibilityLabel={`${t('delight.cook.goTo', { n: n + 1 })}: ${step.text}`}
          onPress={() => onGo(n)}
          style={({ pressed }) => [
            styles.whileRow,
            { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text variant="bodyStrong" color="primary">
            {n + 1}
          </Text>
          <Text variant="callout" style={{ flex: 1 }} numberOfLines={3}>
            {scaleStepText(step.text, factor, i18n.language as Locale)}
          </Text>
          <Icon name="arrow-forward" size={18} color="primary" />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { borderLeftWidth: 4, borderRadius: radius.md, padding: space.md, gap: space.xs },
  while: { gap: space.sm, padding: space.lg, borderRadius: radius.xl },
  whileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    minHeight: 48,
  },
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
