import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { fetch as expoFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import {
  computeTotalMinutes,
  DIFFICULTIES,
  formatMinutes,
  OVEN_MODES,
  RECIPE_CATEGORIES,
  SEASONS,
  uuidv7,
  type Locale,
  type RecipeData,
} from '@pepperedapron/core';
import { emptyRecipe, ValidationError } from '@pepperedapron/client';
import {
  fromIngRows,
  fromStepRows,
  move,
  numOrNull,
  toIngRows,
  toStepRows,
  type IngRow,
  type StepRow,
} from '../../../features/recipe/editorModel';
import { useRepos, useRuntime } from '../../../hooks/runtime';
import { errorMessage } from '../../../lib/errors';
import { useLayout } from '../../../lib/layout';
import { recipePhotoUri } from '../../../lib/media';
import { track } from '../../../services/analytics';
import { draftStore, type EditorDraft } from '../../../services/drafts';
import { haptic } from '../../../services/haptics';
import { attachPhoto, pickImage, removePhoto, type PhotoSource } from '../../../services/photos';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import {
  Button,
  Chip,
  Icon,
  IconButton,
  RecipePhoto,
  Segmented,
  Stepper,
  Text,
  TextField,
  useActionSheet,
  usePrompt,
  useToast,
} from '../../../ui';

type PhotoChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'local'; uri: string }
  | { kind: 'remote'; url: string };

export default function RecipeEditor() {
  const {
    id,
    draft: draftKey,
    focus,
  } = useLocalSearchParams<{ id?: string; draft?: string; focus?: string }>();
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { colors } = useTheme();
  const rt = useRuntime();
  const repos = useRepos();
  const layout = useLayout();
  const toast = useToast();
  const sheet = useActionSheet();
  const prompt = usePrompt();
  const navigation = useNavigation();

  const existing = id ? repos.recipe(id) : null;
  const draft: EditorDraft | null = draftKey ? draftStore.get(draftKey) : null;
  // Snapshot taken once: later sync updates must not overwrite what the user is editing.
  const [initial] = useState<RecipeData>(
    () => existing?.data ?? draft?.data ?? emptyRecipe(repos.settings().defaultServings),
  );

  const [data, setData] = useState<RecipeData>(initial);
  const [ings, setIngs] = useState<IngRow[]>(() =>
    initial.ingredients.length
      ? toIngRows(initial.ingredients, locale)
      : [{ kind: 'ing', key: uuidv7(), text: '', source: null }],
  );
  const [steps, setSteps] = useState<StepRow[]>(() =>
    initial.steps.length
      ? toStepRows(initial.steps)
      : [{ kind: 'step', key: uuidv7(), text: '', timerMin: '', source: null }],
  );
  const [times, setTimes] = useState({
    prep: initial.prepMinutes?.toString() ?? '',
    cook: initial.cookMinutes?.toString() ?? '',
    rest: initial.restMinutes?.toString() ?? '',
    total: initial.totalMinutes?.toString() ?? '',
    oven: initial.ovenTemperatureC?.toString() ?? '',
  });
  const [tagInput, setTagInput] = useState('');
  const [photo, setPhoto] = useState<PhotoChange>(
    draft?.localImageUri
      ? { kind: 'local', uri: draft.localImageUri }
      : draft?.imageUrl
        ? { kind: 'remote', url: draft.imageUrl }
        : { kind: 'keep' },
  );
  const [titleError, setTitleError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(!!existing || !!draft);
  const dirty = useRef(false);
  const saved = useRef(false);
  const scroll = useRef<ScrollView>(null);

  const patch = (p: Partial<RecipeData>) => {
    dirty.current = true;
    setData((d) => ({ ...d, ...p }));
  };

  useEffect(() => {
    // Protect against losing work (swipe down / back) — ask before discarding.
    return navigation.addListener('beforeRemove', (e) => {
      if (!dirty.current || saved.current) return;
      e.preventDefault();
      Alert.alert(t('editor.discardTitle'), t('editor.discardBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('editor.discard'),
          style: 'destructive',
          onPress: () => navigation.dispatch(e.data.action),
        },
      ]);
    });
  }, [navigation, t]);

  useEffect(() => () => void (draftKey && draftStore.drop(draftKey)), [draftKey]);
  useEffect(() => {
    if (focus === 'notes') setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 400);
  }, [focus]);

  const autoTotal = computeTotalMinutes({
    prepMinutes: numOrNull(times.prep),
    cookMinutes: numOrNull(times.cook),
    restMinutes: numOrNull(times.rest),
    totalMinutes: null,
  });

  const choosePhoto = () =>
    sheet({
      title: t('editor.photo'),
      message: t('editor.photoOptional'),
      options: [
        {
          label: t('editor.takePhoto'),
          icon: 'camera-outline',
          onPress: () => void pick('camera'),
        },
        {
          label: t('editor.chooseLibrary'),
          icon: 'images-outline',
          onPress: () => void pick('library'),
        },
        {
          label: t('editor.chooseFile'),
          icon: 'folder-outline',
          onPress: () => void pick('files'),
        },
        ...(currentPhotoUri
          ? [
              {
                label: t('editor.removePhoto'),
                icon: 'trash-outline' as const,
                destructive: true,
                onPress: () => {
                  dirty.current = true;
                  setPhoto({ kind: 'remove' });
                },
              },
            ]
          : []),
      ],
    });

  const pick = async (source: PhotoSource) => {
    const r = await pickImage(source);
    if (!r) return;
    if ('denied' in r) {
      Alert.alert(
        source === 'camera' ? t('errors.cameraPermission') : t('errors.photoPermission'),
        undefined,
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('errors.openSettings'), onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    dirty.current = true;
    setPhoto({ kind: 'local', uri: r.uri });
  };

  const currentPhotoUri =
    photo.kind === 'local'
      ? photo.uri
      : photo.kind === 'remote'
        ? photo.url
        : photo.kind === 'remove'
          ? null
          : existing
            ? recipePhotoUri(existing)
            : null;

  const save = async () => {
    const final: RecipeData = {
      ...data,
      prepMinutes: numOrNull(times.prep),
      cookMinutes: numOrNull(times.cook),
      restMinutes: numOrNull(times.rest),
      totalMinutes: numOrNull(times.total),
      ovenTemperatureC: numOrNull(times.oven),
      ingredients: fromIngRows(ings, locale),
      steps: fromStepRows(steps),
    };
    if (!final.title.trim()) {
      setTitleError(t('errors.titleRequired'));
      scroll.current?.scrollTo({ y: 0, animated: true });
      haptic.error();
      return;
    }
    try {
      const rec = existing
        ? await repos.updateRecipe(existing.id, final)
        : await repos.createRecipe(final);
      if (!existing) track('recipe_created', { source: draft?.notice ?? 'blank' });
      saved.current = true;
      // Photo work happens after the recipe exists; failures never lose the recipe.
      try {
        if (photo.kind === 'local') await attachPhoto(rec.id, photo.uri);
        else if (photo.kind === 'remove') await removePhoto(rec.id);
        else if (photo.kind === 'remote') {
          const res = await expoFetch(photo.url);
          if (res.ok) {
            const tmp = new File(Paths.cache, `${uuidv7()}.jpg`);
            tmp.write(await res.bytes());
            await attachPhoto(rec.id, tmp.uri);
          }
        }
      } catch {
        toast(t('errors.upload_failed'), { tone: 'error' });
      }
      haptic.success();
      toast(t('editor.saved'));
      rt.scheduleSync(300);
      if (existing) router.back();
      else router.replace(`/recipe/${rec.id}`);
    } catch (e) {
      if (e instanceof ValidationError && e.issues[0]?.path === 'title')
        setTitleError(t('errors.titleRequired'));
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  const pasteList = () =>
    prompt({
      title: t('editor.pasteIngredients'),
      message: t('editor.pasteHint'),
      multiline: true,
      maxLength: 10000,
      onSubmit: (text) => {
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (!lines.length) return;
        dirty.current = true;
        setIngs((rows) => [
          ...rows.filter((r) => r.kind === 'group' || r.text.trim()),
          ...lines.map((l) => ({ kind: 'ing' as const, key: uuidv7(), text: l, source: null })),
        ]);
      },
    });

  const header = (
    <View style={[styles.header, { borderBottomColor: colors.line }]}>
      <Button title={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
      <Text variant="title3" style={{ flex: 1 }} align="center" numberOfLines={1}>
        {existing ? t('editor.editTitle') : t('editor.newTitle')}
      </Text>
      <Button title={t('common.save')} size="sm" onPress={save} testID="editor-save" />
    </View>
  );

  const section = (title: string, children: React.ReactNode) => (
    <View style={{ gap: space.md }}>
      <Text variant="title2" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{
            padding: layout.gutter,
            paddingBottom: 120,
            gap: space.xxl,
            maxWidth: 760,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          {draft?.notice ? (
            <View
              style={[
                styles.notice,
                {
                  backgroundColor:
                    draft.notice === 'minimal' ? colors.accentSoft : colors.primarySoft,
                },
              ]}
            >
              <Icon
                name="information-circle-outline"
                size={20}
                color={draft.notice === 'minimal' ? 'accent' : 'primary'}
              />
              <Text variant="callout" style={{ flex: 1 }}>
                {draft.notice === 'full'
                  ? t('import.full')
                  : draft.notice === 'minimal'
                    ? t('import.minimal')
                    : draft.notice === 'partial'
                      ? t('import.partial')
                      : t('editor.importedNotice')}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={currentPhotoUri ? t('editor.changePhoto') : t('editor.addPhoto')}
            onPress={choosePhoto}
            style={{ borderRadius: radius.xl, overflow: 'hidden' }}
            testID="editor-photo"
          >
            {currentPhotoUri ? (
              <RecipePhoto
                uri={currentPhotoUri}
                category={data.category}
                style={{ width: '100%', aspectRatio: 16 / 10 }}
              />
            ) : (
              <View
                style={[
                  styles.photoEmpty,
                  { borderColor: colors.line, backgroundColor: colors.surface },
                ]}
              >
                <Icon name="camera-outline" size={28} color="primary" />
                <Text variant="bodyStrong" color="primary">
                  {t('editor.addPhoto')}
                </Text>
                <Text variant="caption" color="textSubtle">
                  {t('editor.photoOptional')}
                </Text>
              </View>
            )}
          </Pressable>

          <View style={{ gap: space.lg }}>
            <TextField
              label={t('editor.title')}
              placeholder={t('editor.titlePlaceholder')}
              value={data.title}
              onChangeText={(v) => {
                setTitleError(null);
                patch({ title: v });
              }}
              error={titleError}
              maxLength={200}
              testID="editor-title"
              returnKeyType="next"
            />
            <TextField
              label={t('editor.description')}
              placeholder={t('editor.descriptionPlaceholder')}
              value={data.description ?? ''}
              onChangeText={(v) => patch({ description: v })}
              multiline
              maxLength={2000}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: space.md,
              }}
            >
              <Text variant="bodyStrong">{t('editor.servings')}</Text>
              <Stepper
                value={data.servings}
                onChange={(v) => patch({ servings: v })}
                label={t('editor.servings')}
                testID="editor-servings"
              />
            </View>
          </View>

          {section(
            t('editor.ingredients'),
            <View style={{ gap: space.sm }}>
              {ings.map((row, i) =>
                row.kind === 'group' ? (
                  <View key={row.key} style={styles.row}>
                    <TextField
                      containerStyle={{ flex: 1 }}
                      value={row.name}
                      placeholder={t('editor.groupPlaceholder')}
                      onChangeText={(v) => {
                        dirty.current = true;
                        setIngs((r) => r.map((x, j) => (j === i ? { ...x, name: v } : x)));
                      }}
                      style={{ fontWeight: '700' }}
                    />
                    <IconButton
                      icon="close"
                      label={t('common.remove')}
                      variant="plain"
                      onPress={() => setIngs((r) => r.filter((_, j) => j !== i))}
                    />
                  </View>
                ) : (
                  <View key={row.key} style={styles.row}>
                    <TextField
                      containerStyle={{ flex: 1 }}
                      value={row.text}
                      placeholder={t('editor.ingredientPlaceholder')}
                      onChangeText={(v) => {
                        dirty.current = true;
                        setIngs((r) => r.map((x, j) => (j === i ? { ...x, text: v } : x)));
                      }}
                      onSubmitEditing={() =>
                        setIngs((r) => [
                          ...r.slice(0, i + 1),
                          { kind: 'ing', key: uuidv7(), text: '', source: null },
                          ...r.slice(i + 1),
                        ])
                      }
                      returnKeyType="next"
                      blurOnSubmit={false}
                      testID={`editor-ingredient-${i}`}
                    />
                    <IconButton
                      icon="chevron-up"
                      label={t('editor.moveUp')}
                      variant="plain"
                      size={36}
                      onPress={() => setIngs((r) => move(r, i, i - 1))}
                    />
                    <IconButton
                      icon="trash-outline"
                      label={t('common.remove')}
                      variant="plain"
                      size={36}
                      onPress={() => {
                        dirty.current = true;
                        setIngs((r) => r.filter((_, j) => j !== i));
                      }}
                    />
                  </View>
                ),
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                <Button
                  title={t('editor.addIngredient')}
                  icon="add"
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    setIngs((r) => [...r, { kind: 'ing', key: uuidv7(), text: '', source: null }])
                  }
                  testID="editor-add-ingredient"
                />
                <Button
                  title={t('editor.addGroup')}
                  icon="folder-open-outline"
                  variant="ghost"
                  size="sm"
                  onPress={() => setIngs((r) => [...r, { kind: 'group', key: uuidv7(), name: '' }])}
                />
                <Button
                  title={t('editor.pasteIngredients')}
                  icon="clipboard-outline"
                  variant="ghost"
                  size="sm"
                  onPress={pasteList}
                />
              </View>
            </View>,
          )}

          {section(
            t('editor.steps'),
            <View style={{ gap: space.md }}>
              {steps.map((row, i) =>
                row.kind === 'group' ? (
                  <View key={row.key} style={styles.row}>
                    <TextField
                      containerStyle={{ flex: 1 }}
                      value={row.name}
                      placeholder={t('editor.groupPlaceholder')}
                      onChangeText={(v) =>
                        setSteps((r) => r.map((x, j) => (j === i ? { ...x, name: v } : x)))
                      }
                    />
                    <IconButton
                      icon="close"
                      label={t('common.remove')}
                      variant="plain"
                      onPress={() => setSteps((r) => r.filter((_, j) => j !== i))}
                    />
                  </View>
                ) : (
                  <View
                    key={row.key}
                    style={[
                      styles.stepCard,
                      { backgroundColor: colors.surface, borderColor: colors.line },
                    ]}
                  >
                    <View style={styles.row}>
                      <Text variant="bodyStrong" color="primary" style={{ flex: 1 }}>
                        {t('recipe.stepN', {
                          n: steps.slice(0, i + 1).filter((x) => x.kind === 'step').length,
                        })}
                      </Text>
                      <IconButton
                        icon="chevron-up"
                        label={t('editor.moveUp')}
                        variant="plain"
                        size={36}
                        onPress={() => setSteps((r) => move(r, i, i - 1))}
                      />
                      <IconButton
                        icon="chevron-down"
                        label={t('editor.moveDown')}
                        variant="plain"
                        size={36}
                        onPress={() => setSteps((r) => move(r, i, i + 1))}
                      />
                      <IconButton
                        icon="trash-outline"
                        label={t('common.remove')}
                        variant="plain"
                        size={36}
                        onPress={() => {
                          dirty.current = true;
                          setSteps((r) => r.filter((_, j) => j !== i));
                        }}
                      />
                    </View>
                    <TextField
                      value={row.text}
                      placeholder={t('editor.stepPlaceholder')}
                      multiline
                      onChangeText={(v) => {
                        dirty.current = true;
                        setSteps((r) => r.map((x, j) => (j === i ? { ...x, text: v } : x)));
                      }}
                      maxLength={3000}
                      testID={`editor-step-${i}`}
                    />
                    <TextField
                      label={t('editor.timer')}
                      value={row.timerMin}
                      keyboardType="decimal-pad"
                      onChangeText={(v) =>
                        setSteps((r) =>
                          r.map((x, j) =>
                            j === i && x.kind === 'step'
                              ? { ...x, timerMin: v.replace(/[^0-9.,]/g, '') }
                              : x,
                          ),
                        )
                      }
                      containerStyle={{ width: 160 }}
                      icon="timer-outline"
                    />
                  </View>
                ),
              )}
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button
                  title={t('editor.addStep')}
                  icon="add"
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    setSteps((r) => [
                      ...r,
                      { kind: 'step', key: uuidv7(), text: '', timerMin: '', source: null },
                    ])
                  }
                  testID="editor-add-step"
                />
                <Button
                  title={t('editor.addGroup')}
                  icon="folder-open-outline"
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    setSteps((r) => [...r, { kind: 'group', key: uuidv7(), name: '' }])
                  }
                />
              </View>
            </View>,
          )}

          {section(
            t('editor.times'),
            <View style={{ gap: space.md }}>
              <View style={styles.grid2}>
                {(['prep', 'cook', 'rest', 'total'] as const).map((k) => (
                  <TextField
                    key={k}
                    containerStyle={{ flexGrow: 1, flexBasis: 140 }}
                    label={t(`editor.${k}`)}
                    value={times[k]}
                    keyboardType="number-pad"
                    placeholder={k === 'total' && autoTotal ? String(autoTotal) : undefined}
                    helper={
                      k === 'total' && autoTotal && !times.total
                        ? t('editor.totalAuto', { time: formatMinutes(autoTotal, locale) })
                        : undefined
                    }
                    onChangeText={(v) => {
                      dirty.current = true;
                      setTimes((x) => ({ ...x, [k]: v.replace(/[^0-9]/g, '').slice(0, 5) }));
                    }}
                  />
                ))}
              </View>
            </View>,
          )}

          {showMore ? (
            <>
              {section(
                t('editor.details'),
                <View style={{ gap: space.lg }}>
                  <Text variant="caption" color="textMuted" weight="600">
                    {t('editor.category')}
                  </Text>
                  <View style={styles.wrap}>
                    {RECIPE_CATEGORIES.map((c) => (
                      <Chip
                        key={c}
                        label={t(`categories.${c}`)}
                        selected={data.category === c}
                        onPress={() => patch({ category: data.category === c ? null : c })}
                      />
                    ))}
                  </View>
                  <Text variant="caption" color="textMuted" weight="600">
                    {t('editor.difficulty')}
                  </Text>
                  <Segmented
                    value={data.difficulty ?? ('none' as never)}
                    onChange={(v) => patch({ difficulty: data.difficulty === v ? null : v })}
                    options={DIFFICULTIES.map((d) => ({ value: d, label: t(`difficulty.${d}`) }))}
                  />
                  <Text variant="caption" color="textMuted" weight="600">
                    {t('editor.seasons')}
                  </Text>
                  <View style={styles.wrap}>
                    {SEASONS.map((s) => (
                      <Chip
                        key={s}
                        label={t(`seasons.${s}`)}
                        selected={data.seasons.includes(s)}
                        onPress={() =>
                          patch({
                            seasons: data.seasons.includes(s)
                              ? data.seasons.filter((x) => x !== s)
                              : [...data.seasons, s],
                          })
                        }
                      />
                    ))}
                  </View>
                  <View style={styles.grid2}>
                    <TextField
                      containerStyle={{ flexGrow: 1, flexBasis: 140 }}
                      label={t('editor.oven')}
                      value={times.oven}
                      keyboardType="number-pad"
                      icon="flame-outline"
                      onChangeText={(v) => {
                        dirty.current = true;
                        setTimes((x) => ({ ...x, oven: v.replace(/[^0-9]/g, '').slice(0, 3) }));
                      }}
                    />
                  </View>
                  {times.oven ? (
                    <View style={styles.wrap}>
                      {OVEN_MODES.map((m) => (
                        <Chip
                          key={m}
                          label={t(`oven.${m}`)}
                          selected={data.ovenMode === m}
                          onPress={() => patch({ ovenMode: data.ovenMode === m ? null : m })}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>,
              )}
              {section(
                t('editor.tips'),
                <View style={{ gap: space.lg }}>
                  <TextField
                    label={t('editor.tips')}
                    value={data.tips ?? ''}
                    onChangeText={(v) => patch({ tips: v })}
                    multiline
                    maxLength={5000}
                  />
                  <TextField
                    label={t('editor.notes')}
                    value={data.notes ?? ''}
                    onChangeText={(v) => patch({ notes: v })}
                    multiline
                    maxLength={5000}
                    autoFocus={focus === 'notes'}
                  />
                  <TextField
                    label={t('editor.extraInfo')}
                    value={data.extraInfo ?? ''}
                    onChangeText={(v) => patch({ extraInfo: v })}
                    multiline
                    maxLength={5000}
                  />
                  <TextField
                    label={t('editor.source')}
                    placeholder={t('editor.sourcePlaceholder')}
                    value={data.source ?? ''}
                    onChangeText={(v) => patch({ source: v })}
                    maxLength={500}
                  />
                  <TextField
                    label={t('editor.sourceUrl')}
                    placeholder="https://"
                    value={data.sourceUrl ?? ''}
                    onChangeText={(v) => patch({ sourceUrl: v.trim() || null })}
                    autoCapitalize="none"
                    keyboardType="url"
                    maxLength={2048}
                    error={
                      data.sourceUrl && !/^https?:\/\/\S+\.\S+/.test(data.sourceUrl)
                        ? t('errors.invalidField')
                        : null
                    }
                  />
                  <View style={{ gap: space.sm }}>
                    <TextField
                      label={t('editor.tags')}
                      placeholder={t('editor.tagsPlaceholder')}
                      value={tagInput}
                      onChangeText={setTagInput}
                      onSubmitEditing={() => {
                        const v = tagInput.trim().replace(/^#/, '').toLowerCase();
                        if (v && data.tags.length < 20 && !data.tags.includes(v))
                          patch({ tags: [...data.tags, v.slice(0, 40)] });
                        setTagInput('');
                      }}
                      autoCapitalize="none"
                      returnKeyType="done"
                      blurOnSubmit={false}
                    />
                    <View style={styles.wrap}>
                      {data.tags.map((tag) => (
                        <Chip
                          key={tag}
                          label={`#${tag}  ✕`}
                          onPress={() => patch({ tags: data.tags.filter((x) => x !== tag) })}
                        />
                      ))}
                    </View>
                  </View>
                </View>,
              )}
              {!existing || existing.ownerId === rt.user?.id
                ? section(
                    t('recipe.visibility'),
                    <View style={{ gap: space.md }}>
                      {rt.household ? (
                        <View style={styles.switchRow}>
                          <Text style={{ flex: 1 }}>{t('recipe.shareHousehold')}</Text>
                          <Switch
                            value={data.householdId !== null}
                            onValueChange={(v) =>
                              patch({ householdId: v ? rt.household!.id : null })
                            }
                            trackColor={{ true: colors.primary, false: colors.line }}
                            accessibilityLabel={t('recipe.shareHousehold')}
                          />
                        </View>
                      ) : null}
                      <View style={styles.switchRow}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text>{t('recipe.makePublic')}</Text>
                          <Text variant="caption" color="textMuted">
                            {t('recipe.makePublicBody')}
                          </Text>
                        </View>
                        <Switch
                          value={data.visibility === 'public'}
                          onValueChange={(v) => patch({ visibility: v ? 'public' : 'private' })}
                          trackColor={{ true: colors.primary, false: colors.line }}
                          accessibilityLabel={t('recipe.makePublic')}
                        />
                      </View>
                    </View>,
                  )
                : null}
            </>
          ) : (
            <Button
              title={t('editor.more')}
              icon="chevron-down"
              variant="ghost"
              onPress={() => setShowMore(true)}
            />
          )}
          <Button title={t('common.save')} size="lg" onPress={save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notice: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    alignItems: 'flex-start',
  },
  photoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    height: 160,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.xl,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  stepCard: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
});
