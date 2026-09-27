import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DIFFICULTIES, EMPTY_FILTERS, isActiveSearch, RECIPE_CATEGORIES, searchRecipes, SEASONS, type Difficulty, type RecipeCategory, type SearchFilters, type Season } from '@pepperedapron/core';
import { AdSlot } from '../../../features/AdSlot';
import { useLive, useRepos } from '../../../hooks/runtime';
import { tileWidth, useLayout } from '../../../lib/layout';
import { track } from '../../../services/analytics';
import { haptic } from '../../../services/haptics';
import { useTheme } from '../../../theme/ThemeProvider';
import { space } from '../../../theme/tokens';
import { Button, Chip, ChipRow, EmptyState, IconButton, RecipeCard, Segmented, Text, TextField } from '../../../ui';

const TIMES = [15, 30, 45, 60];

export default function Search() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const repos = useRepos();
  const layout = useLayout();
  const params = useLocalSearchParams<{ category?: string; maxMinutes?: string; q?: string }>();
  const [mode, setMode] = useState<'search' | 'fridge'>('search');
  const [query, setQuery] = useState(params.q ?? '');
  const [debounced, setDebounced] = useState(query);
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [fridgeInput, setFridgeInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const tracked = useRef('');

  useEffect(() => {
    setFilters((f) => ({
      ...f,
      categories: params.category && (RECIPE_CATEGORIES as readonly string[]).includes(params.category) ? [params.category as RecipeCategory] : f.categories,
      maxMinutes: params.maxMinutes ? Number(params.maxMinutes) || null : f.maxMinutes,
    }));
    if (params.category || params.maxMinutes) setShowFilters(true);
  }, [params.category, params.maxMinutes]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(id);
  }, [query]);

  const all = useLive(['recipe', 'favorite'], (r) => ({ items: r.searchable(), favs: new Set(r.favoriteRecipes().map((x) => x.id)) }));
  const effective = useMemo(() => (mode === 'fridge' ? filters : { ...filters, fridge: [] }), [filters, mode]);
  const active = isActiveSearch(mode === 'fridge' ? '' : debounced, effective);
  const results = useMemo(() => (active ? searchRecipes(all.items, mode === 'fridge' ? '' : debounced, effective) : []), [all.items, debounced, effective, active, mode]);

  useEffect(() => {
    if (active && debounced && debounced !== tracked.current) {
      tracked.current = debounced;
      track('search', { results: results.length });
    }
  }, [active, debounced, results.length]);

  const toggle = <K extends 'categories' | 'seasons'>(key: K, v: SearchFilters[K][number]) =>
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
  const available = (layout.sidebar ? layout.width - 260 : layout.width);
  const w = tileWidth(available, cols, space.md, layout.gutter);
  const rows = useMemo(() => {
    const items: ({ kind: 'recipe'; r: (typeof results)[number] } | { kind: 'ad' })[] = results.map((r) => ({ kind: 'recipe' as const, r }));
    if (items.length > 8) items.splice(8, 0, { kind: 'ad' });
    return items;
  }, [results]);
  const filterCount = filters.categories.length + filters.seasons.length + (filters.difficulty ? 1 : 0) + (filters.maxMinutes ? 1 : 0);

  const header = (
    <View style={{ gap: space.md, paddingTop: space.lg, paddingBottom: space.md }}>
      <View style={{ paddingHorizontal: layout.gutter, gap: space.md }}>
        <Text variant="title1" accessibilityRole="header">
          {t('tabs.search')}
        </Text>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'search', label: t('common.search') }, { value: 'fridge', label: t('search.fridge') }]} />
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
            <IconButton icon={showFilters ? 'options' : 'options-outline'} label={`${t('search.filters')}${filterCount ? ` (${filterCount})` : ''}`} onPress={() => setShowFilters((v) => !v)} variant={filterCount ? 'primary' : 'surface'} size={48} />
          </View>
        ) : (
          <View style={{ gap: space.sm }}>
            <Text variant="title3">{t('search.fridgeTitle')}</Text>
            <Text variant="callout" color="textMuted">
              {t('search.fridgeHint')}
            </Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <TextField containerStyle={{ flex: 1 }} icon="nutrition-outline" placeholder={t('search.fridgePlaceholder')} value={fridgeInput} onChangeText={setFridgeInput} onSubmitEditing={addFridge} returnKeyType="done" blurOnSubmit={false} testID="fridge-input" />
              <IconButton icon="add" label={t('common.add')} onPress={addFridge} variant="primary" size={48} />
            </View>
            {filters.fridge.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {filters.fridge.map((f) => (
                  <Chip key={f} label={`${f}  ✕`} selected onPress={() => setFilters((x) => ({ ...x, fridge: x.fridge.filter((y) => y !== f) }))} />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </View>
      {mode === 'search' && showFilters ? (
        <View style={{ gap: space.sm }}>
          <ChipRow>
            {RECIPE_CATEGORIES.map((c) => (
              <Chip key={c} label={t(`categories.${c}`)} selected={filters.categories.includes(c)} onPress={() => toggle('categories', c)} />
            ))}
          </ChipRow>
          <ChipRow>
            {TIMES.map((m) => (
              <Chip key={m} icon="time-outline" label={`≤ ${t('common.minutes', { count: m })}`} selected={filters.maxMinutes === m} onPress={() => setFilters((f) => ({ ...f, maxMinutes: f.maxMinutes === m ? null : m }))} />
            ))}
            {DIFFICULTIES.map((d: Difficulty) => (
              <Chip key={d} label={t(`difficulty.${d}`)} selected={filters.difficulty === d} onPress={() => setFilters((f) => ({ ...f, difficulty: f.difficulty === d ? null : d }))} />
            ))}
            {SEASONS.map((s: Season) => (
              <Chip key={s} label={t(`seasons.${s}`)} selected={filters.seasons.includes(s)} onPress={() => toggle('seasons', s)} />
            ))}
          </ChipRow>
          {filterCount ? <Button title={t('search.clear')} variant="ghost" size="sm" onPress={() => setFilters((f) => ({ ...EMPTY_FILTERS, fridge: f.fridge }))} style={{ alignSelf: 'flex-start', marginLeft: layout.gutter }} /> : null}
        </View>
      ) : null}
      {active ? (
        <Text variant="caption" color="textMuted" style={{ paddingHorizontal: layout.gutter }} accessibilityLiveRegion="polite">
          {t('search.results', { count: results.length })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        key={cols}
        data={rows}
        numColumns={cols}
        keyExtractor={(item, i) => (item.kind === 'ad' ? `ad-${i}` : item.r.recipe.id)}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        columnWrapperStyle={cols > 1 ? { gap: space.md, paddingHorizontal: layout.gutter } : undefined}
        contentContainerStyle={{ gap: space.lg, paddingBottom: space.huge * 2 }}
        renderItem={({ item }) =>
          item.kind === 'ad' ? (
            <View style={{ width: layout.width - layout.gutter * 2 - (layout.sidebar ? 260 : 0) }}>
              <AdSlot placement="search" />
            </View>
          ) : (
            <View style={{ width: w, gap: 4 }}>
              <RecipeCard
                recipe={item.r.recipe.record}
                width={w}
                favorite={all.favs.has(item.r.recipe.id)}
                onToggleFavorite={() => {
                  haptic.light();
                  void repos.toggleFavorite(item.r.recipe.id);
                }}
                onPress={() => router.push(`/recipe/${item.r.recipe.id}`)}
              />
              {mode === 'fridge' ? (
                <Text variant="caption" color={item.r.missing.length ? 'accent' : 'primary'} numberOfLines={2}>
                  {item.r.missing.length ? t('search.missing', { list: item.r.missing.slice(0, 4).join(', ') }) : t('search.haveAll')}
                </Text>
              ) : null}
            </View>
          )
        }
        ListEmptyComponent={
          active ? (
            <EmptyState emoji="🔍" title={t('search.noResultsTitle')} body={t('search.noResultsBody')} action={query ? t('search.community') : undefined} onAction={() => router.push({ pathname: '/community', params: { q: query } })} />
          ) : mode === 'search' ? (
            <View style={{ paddingHorizontal: layout.gutter, gap: space.md }}>
              <Text variant="title3">{t('search.tryTitle')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {(t('search.examples', { returnObjects: true }) as string[]).map((ex) => (
                  <Chip key={ex} label={ex} icon="sparkles-outline" onPress={() => setQuery(ex)} />
                ))}
              </View>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
