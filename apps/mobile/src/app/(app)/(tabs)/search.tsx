import { useEffect, useMemo, useState } from 'react';
import { FlatList, Keyboard, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  DIET_TAGS,
  DIFFICULTIES,
  EMPTY_FILTERS,
  EQUIPMENT,
  ingredientKey,
  toIsoDate,
  type Equipment,
  isActiveSearch,
  RECIPE_CATEGORIES,
  searchRecipes,
  SEASONS,
  type DietTag,
  type Difficulty,
  type RecipeCategory,
  type SearchFilters,
  type Season,
} from '@pepperedapron/core';
import { useLive, useRepos } from '../../../hooks/runtime';
import { tileWidth, useLayout } from '../../../lib/layout';
import { haptic } from '../../../services/haptics';
import { useTheme } from '../../../theme/ThemeProvider';
import { space } from '../../../theme/tokens';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  IconButton,
  RecipeCard,
  Segmented,
  Text,
  TextField,
  useToast,
} from '../../../ui';
import { Tip } from '../../../ui/Tip';
import { errorMessage, inBackground } from '../../../lib/errors';

const TIMES = [15, 30, 45, 60];

export default function Search() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const repos = useRepos();
  const layout = useLayout();
  const toast = useToast();
  const params = useLocalSearchParams<{
    category?: string;
    maxMinutes?: string;
    q?: string;
    season?: string;
    mode?: string;
    /** From the pantry: "what can I make with this?" */
    pantry?: string;
  }>();
  const [excludeInput, setExcludeInput] = useState('');
  const [mode, setMode] = useState<'search' | 'fridge'>(
    params.mode === 'fridge' ? 'fridge' : 'search',
  );
  const [query, setQuery] = useState(params.q ?? '');
  const [debounced, setDebounced] = useState(query);
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [fridgeInput, setFridgeInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setFilters((f) => ({
      ...f,
      categories:
        params.category && (RECIPE_CATEGORIES as readonly string[]).includes(params.category)
          ? [params.category as RecipeCategory]
          : f.categories,
      maxMinutes: params.maxMinutes ? Number(params.maxMinutes) || null : f.maxMinutes,
      seasons:
        params.season && (SEASONS as readonly string[]).includes(params.season)
          ? [params.season as Season]
          : f.seasons,
    }));
    if (params.category || params.maxMinutes || params.season) setShowFilters(true);
  }, [params.category, params.maxMinutes, params.season]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(id);
  }, [query]);

  // What is at home, the soonest to expire first: picked in one tap in "My fridge".
  const pantry = useLive(['pantryItem'], (r) => {
    const soon = addDays(toIsoDate(new Date()), 3);
    const seen = new Set<string>();
    return r
      .pantryItems()
      .filter((p) => {
        const k = ingredientKey(p.data.name);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 24)
      .map((p) => ({
        name: p.data.name,
        soon: p.data.expiresOn !== null && p.data.expiresOn <= soon,
      }));
  });
  useEffect(() => {
    if (params.mode === 'fridge') setMode('fridge');
    if (params.pantry !== '1') return;
    // From the pantry: what expires soon, or else everything at home.
    const soon = pantry.filter((p) => p.soon);
    const pick = (soon.length ? soon : pantry).slice(0, 15).map((p) => p.name);
    if (pick.length) setFilters((f) => ({ ...f, fridge: pick }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.mode, params.pantry]);

  const compact = useLive(['settings'], (r) => r.settings().compactLists);
  const all = useLive(['recipe', 'favorite'], (r) => ({
    items: r.searchable(),
    favs: new Set(r.favoriteRecipes().map((x) => x.id)),
  }));
  const effective = useMemo(
    () => (mode === 'fridge' ? filters : { ...filters, fridge: [] }),
    [filters, mode],
  );
  const active = isActiveSearch(mode === 'fridge' ? '' : debounced, effective);
  const results = useMemo(
    () => (active ? searchRecipes(all.items, mode === 'fridge' ? '' : debounced, effective) : []),
    [all.items, debounced, effective, active, mode],
  );

  const toggle = <K extends 'categories' | 'seasons' | 'diets'>(
    key: K,
    v: SearchFilters[K][number],
  ) =>
    setFilters((f) => {
      const cur = f[key] as string[];
      return { ...f, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  const addFridge = () => {
    const v = fridgeInput.trim();
    if (!v) return;
    setFilters((f) => ({ ...f, fridge: [...new Set([...f.fridge, v])] }));
    setFridgeInput('');
    haptic.selection();
  };

  const cols = layout.sidebar ? Math.max(2, layout.columns - 1) : layout.columns;
  const available = layout.sidebar ? layout.width - 260 : layout.width;
  const w = tileWidth(available, cols, space.md, layout.gutter);
  const addExcluded = () => {
    const v = excludeInput.trim();
    if (!v) return;
    setFilters((f) => ({ ...f, excluded: [...new Set([...f.excluded, v])] }));
    setExcludeInput('');
    haptic.selection();
  };

  const toggleFridge = (name: string) => {
    haptic.selection();
    setFilters((f) => ({
      ...f,
      fridge: f.fridge.includes(name) ? f.fridge.filter((x) => x !== name) : [...f.fridge, name],
    }));
  };
  /** Equipment: tap once to require it, twice to exclude it ("no oven"), a third time to clear. */
  const cycleEquipment = (e: Equipment) => {
    haptic.selection();
    setFilters((f) => {
      const need = f.equipment ?? [];
      const without = f.withoutEquipment ?? [];
      if (need.includes(e))
        return {
          ...f,
          equipment: need.filter((x) => x !== e),
          withoutEquipment: e === 'noCook' ? without : [...without, e],
        };
      if (without.includes(e)) return { ...f, withoutEquipment: without.filter((x) => x !== e) };
      return { ...f, equipment: [...need, e] };
    });
  };
  /** The missing ingredients of a recipe go to the shopping list, with their quantities. */
  const addMissing = async (recipeId: string, missing: string[]) => {
    try {
      const rec = repos.recipe(recipeId);
      if (!rec) return;
      const list = await repos.ensureActiveList(t('shopping.defaultName'));
      const names = new Set(missing);
      const lines = rec.data.ingredients.filter((i) => names.has(i.name));
      for (const i of lines)
        await repos.addItem(list.id, {
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          recipeIds: [recipeId],
        });
      haptic.success();
      toast(t('fridge.addedMissing', { count: lines.length }));
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  const filterCount =
    (filters.equipment?.length ?? 0) +
    (filters.withoutEquipment?.length ?? 0) +
    filters.categories.length +
    filters.seasons.length +
    filters.diets.length +
    filters.excluded.length +
    (filters.difficulty ? 1 : 0) +
    (filters.maxMinutes ? 1 : 0);

  const header = (
    <View style={{ gap: space.md, paddingTop: space.lg, paddingBottom: space.md }}>
      <View style={{ paddingHorizontal: layout.gutter, gap: space.md }}>
        <Text variant="title1" accessibilityRole="header">
          {t('tabs.search')}
        </Text>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'search', label: t('common.search') },
            { value: 'fridge', label: t('search.fridge') },
          ]}
        />
        <Tip id="search" icon="search-outline" />
        {mode === 'search' ? (
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
            <TextField
              containerStyle={{ flex: 1 }}
              icon="search"
              placeholder={t('search.placeholder')}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
              testID="search-input"
            />
            <IconButton
              icon={showFilters ? 'options' : 'options-outline'}
              label={`${t('search.filters')}${filterCount ? ` (${filterCount})` : ''}`}
              onPress={() => setShowFilters((v) => !v)}
              variant={filterCount ? 'primary' : 'surface'}
              size={48}
            />
          </View>
        ) : (
          <View style={{ gap: space.sm }}>
            <Text variant="title3">{t('search.fridgeTitle')}</Text>
            <Text variant="callout" color="textMuted">
              {t('search.fridgeHint')}
            </Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <TextField
                containerStyle={{ flex: 1 }}
                icon="nutrition-outline"
                placeholder={t('search.fridgePlaceholder')}
                value={fridgeInput}
                onChangeText={setFridgeInput}
                onSubmitEditing={addFridge}
                returnKeyType="done"
                blurOnSubmit={false}
                testID="fridge-input"
              />
              <IconButton
                icon="add"
                label={t('common.add')}
                onPress={addFridge}
                variant="primary"
                size={48}
              />
            </View>
            {filters.fridge.filter((f) => !pantry.some((p) => p.name === f)).length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {filters.fridge
                  .filter((f) => !pantry.some((p) => p.name === f))
                  .map((f) => (
                    <Chip key={f} label={`${f}  ✕`} selected onPress={() => toggleFridge(f)} />
                  ))}
              </View>
            ) : null}
            {pantry.length ? (
              <View style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {t('fridge.atHome')}
                  </Text>
                  <Button
                    title={t('fridge.useAll')}
                    variant="ghost"
                    size="sm"
                    onPress={() =>
                      setFilters((f) => ({
                        ...f,
                        fridge: [...new Set([...f.fridge, ...pantry.map((p) => p.name)])],
                      }))
                    }
                  />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {pantry.map((p) => (
                    <Chip
                      key={p.name}
                      icon={p.soon ? 'alarm-outline' : undefined}
                      label={p.name}
                      selected={filters.fridge.includes(p.name)}
                      onPress={() => toggleFridge(p.name)}
                    />
                  ))}
                </View>
                {pantry.some((p) => p.soon) ? (
                  <Text variant="caption" color="textMuted">
                    {t('fridge.soonHint')}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Button
                title={t('fridge.fillPantry')}
                icon="file-tray-stacked-outline"
                variant="ghost"
                size="sm"
                onPress={() => router.push('/pantry')}
                style={{ alignSelf: 'flex-start' }}
              />
            )}
          </View>
        )}
      </View>
      {mode === 'search' && showFilters ? (
        <View style={{ gap: space.sm }}>
          <ChipRow>
            {RECIPE_CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={t(`categories.${c}`)}
                selected={filters.categories.includes(c)}
                onPress={() => toggle('categories', c)}
              />
            ))}
          </ChipRow>
          <ChipRow>
            {TIMES.map((m) => (
              <Chip
                key={m}
                icon="time-outline"
                label={`≤ ${t('common.minutes', { count: m })}`}
                selected={filters.maxMinutes === m}
                onPress={() =>
                  setFilters((f) => ({ ...f, maxMinutes: f.maxMinutes === m ? null : m }))
                }
              />
            ))}
            {DIFFICULTIES.map((d: Difficulty) => (
              <Chip
                key={d}
                label={t(`difficulty.${d}`)}
                selected={filters.difficulty === d}
                onPress={() =>
                  setFilters((f) => ({ ...f, difficulty: f.difficulty === d ? null : d }))
                }
              />
            ))}
            {SEASONS.map((s: Season) => (
              <Chip
                key={s}
                label={t(`seasons.${s}`)}
                selected={filters.seasons.includes(s)}
                onPress={() => toggle('seasons', s)}
              />
            ))}
          </ChipRow>
          <ChipRow>
            {EQUIPMENT.map((e: Equipment) => {
              const need = filters.equipment?.includes(e) ?? false;
              const without = filters.withoutEquipment?.includes(e) ?? false;
              return (
                <Chip
                  key={e}
                  icon={without ? 'close-circle-outline' : 'flame-outline'}
                  label={
                    without
                      ? t('equipment.without', { name: t(`equipment.${e}`) })
                      : t(`equipment.${e}`)
                  }
                  selected={need || without}
                  onPress={() => cycleEquipment(e)}
                  testID={`equipment-${e}`}
                />
              );
            })}
          </ChipRow>
          <ChipRow>
            {DIET_TAGS.map((d: DietTag) => (
              <Chip
                key={d}
                icon="leaf-outline"
                label={t(`diets.${d}`)}
                selected={filters.diets.includes(d)}
                onPress={() => toggle('diets', d)}
              />
            ))}
          </ChipRow>
          {filters.diets.length ? (
            <Text variant="caption" color="textMuted" style={{ paddingHorizontal: layout.gutter }}>
              {t('diets.hint')}
            </Text>
          ) : null}
          <View style={{ paddingHorizontal: layout.gutter, gap: space.sm }}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <TextField
                containerStyle={{ flex: 1 }}
                icon="remove-circle-outline"
                placeholder={t('search.excludePlaceholder')}
                value={excludeInput}
                onChangeText={setExcludeInput}
                onSubmitEditing={addExcluded}
                returnKeyType="done"
                blurOnSubmit={false}
                accessibilityLabel={t('search.excludeTitle')}
                testID="exclude-input"
              />
              <IconButton
                icon="add"
                label={t('common.add')}
                onPress={addExcluded}
                variant="surface"
                size={48}
              />
            </View>
            {filters.excluded.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {filters.excluded.map((x) => (
                  <Chip
                    key={x}
                    label={`${t('search.excludeTitle')} ${x}  ✕`}
                    selected
                    onPress={() =>
                      setFilters((f) => ({ ...f, excluded: f.excluded.filter((y) => y !== x) }))
                    }
                  />
                ))}
              </View>
            ) : null}
          </View>
          {filterCount ? (
            <Button
              title={t('search.clear')}
              variant="ghost"
              size="sm"
              onPress={() => setFilters((f) => ({ ...EMPTY_FILTERS, fridge: f.fridge }))}
              style={{ alignSelf: 'flex-start', marginLeft: layout.gutter }}
            />
          ) : null}
        </View>
      ) : null}
      {active ? (
        <Text
          variant="caption"
          color="textMuted"
          style={{ paddingHorizontal: layout.gutter }}
          accessibilityLiveRegion="polite"
        >
          {t('search.results', { count: results.length })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        key={compact ? 'rows' : cols}
        data={results}
        numColumns={compact ? 1 : cols}
        keyExtractor={(item) => item.recipe.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        columnWrapperStyle={
          !compact && cols > 1 ? { gap: space.md, paddingHorizontal: layout.gutter } : undefined
        }
        contentContainerStyle={{ gap: space.lg, paddingBottom: space.huge * 2 }}
        renderItem={({ item }) => (
          <View
            style={compact ? { paddingHorizontal: layout.gutter, gap: 2 } : { width: w, gap: 4 }}
          >
            <RecipeCard
              variant={compact ? 'row' : 'tile'}
              zoom={!compact}
              recipe={item.recipe.record}
              width={w}
              favorite={all.favs.has(item.recipe.id)}
              onToggleFavorite={() => {
                haptic.light();
                inBackground(repos.toggleFavorite(item.recipe.id));
              }}
              onPress={() => router.push(`/recipe/${item.recipe.id}`)}
            />
            {mode === 'fridge' ? (
              <>
                <Text variant="caption" weight="700" color="primary">
                  {t('fridge.coverage', {
                    n: item.matchedFridge,
                    total: item.matchedFridge + item.missing.length,
                  })}
                </Text>
                <Text
                  variant="caption"
                  color={item.missing.length ? 'accent' : 'primary'}
                  numberOfLines={2}
                >
                  {item.missing.length
                    ? t('search.missing', { list: item.missing.slice(0, 4).join(', ') })
                    : t('search.haveAll')}
                </Text>
                {item.missing.length ? (
                  <Button
                    title={t('fridge.addMissing')}
                    icon="cart-outline"
                    variant="ghost"
                    size="sm"
                    onPress={() => void addMissing(item.recipe.id, item.missing)}
                    style={{ alignSelf: 'flex-start' }}
                  />
                ) : null}
              </>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          active ? (
            <EmptyState
              emoji="🔍"
              title={t('search.noResultsTitle')}
              body={t('search.noResultsBody')}
              action={t('search.addRecipe')}
              onAction={() => router.push('/add')}
            />
          ) : mode === 'search' ? (
            <View style={{ paddingHorizontal: layout.gutter, gap: space.md }}>
              <Text variant="title3">{t('search.tryTitle')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {(t('search.examples', { returnObjects: true }) as string[]).map((ex) => (
                  <Chip key={ex} label={ex} icon="sparkles-outline" onPress={() => setQuery(ex)} />
                ))}
              </View>
            </View>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}
