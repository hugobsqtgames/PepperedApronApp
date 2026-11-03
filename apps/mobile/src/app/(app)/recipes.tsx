import { useMemo, useState } from 'react';
import { FlatList, Keyboard, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  computeTotalMinutes,
  EMPTY_FILTERS,
  normalizeText,
  searchRecipes,
} from '@pepperedapron/core';
import { useLive, useRepos } from '../../hooks/runtime';
import { inBackground } from '../../lib/errors';
import { tileWidth, useLayout } from '../../lib/layout';
import { haptic } from '../../services/haptics';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';
import { Chip, ChipRow, EmptyState, IconButton, RecipeCard, Text, TextField } from '../../ui';

const SORTS = ['recent', 'az', 'quick', 'rated'] as const;
type Sort = (typeof SORTS)[number];

/**
 * Every recipe of the library on one page (the home screen only had the categories): sorted
 * by date, name, time or rating, with a quick filter.
 */
export default function AllRecipes() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const repos = useRepos();
  const layout = useLayout();
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const all = useLive(['recipe', 'favorite'], (r) => ({
    items: r.searchable(r.library()),
    favs: new Set(r.favoriteRecipes().map((f) => f.id)),
  }));

  const recipes = useMemo(() => {
    const found = query.trim()
      ? searchRecipes(all.items, query, EMPTY_FILTERS).map((x) => x.recipe)
      : all.items;
    const list = [...found];
    if (sort === 'az') {
      const collator = new Intl.Collator(i18n.language, { sensitivity: 'base' });
      list.sort((a, b) => collator.compare(normalizeText(a.title), normalizeText(b.title)));
    } else if (sort === 'quick')
      list.sort(
        (a, b) =>
          (computeTotalMinutes(a.record.data) ?? 9999) -
          (computeTotalMinutes(b.record.data) ?? 9999),
      );
    else if (sort === 'rated')
      list.sort((a, b) => (b.record.data.rating ?? 0) - (a.record.data.rating ?? 0));
    else if (!query.trim()) list.sort((a, b) => b.record.hlc.localeCompare(a.record.hlc));
    return list;
  }, [all.items, query, sort, i18n.language]);

  const cols = layout.sidebar ? Math.max(2, layout.columns - 1) : layout.columns;
  const available = layout.sidebar ? layout.width - 260 : layout.width;
  const w = tileWidth(available, cols, space.md, layout.gutter);

  const header = (
    <View style={{ gap: space.md, paddingHorizontal: layout.gutter, paddingTop: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <IconButton
          icon="chevron-back"
          label={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <View style={{ flex: 1 }}>
          <Text variant="title1" accessibilityRole="header" testID="all-recipes-title">
            {t('allRecipes.title')}
          </Text>
          <Text variant="caption" color="textMuted">
            {t('common.recipes', { count: all.items.length })}
          </Text>
        </View>
      </View>
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={t('allRecipes.filter')}
        accessibilityLabel={t('allRecipes.filter')}
        returnKeyType="search"
        clearButtonMode="while-editing"
        testID="all-recipes-filter"
      />
      <ChipRow>
        {SORTS.map((s) => (
          <Chip
            key={s}
            label={t(`allRecipes.sort.${s}`)}
            selected={sort === s}
            onPress={() => {
              haptic.selection();
              setSort(s);
            }}
            testID={`all-recipes-sort-${s}`}
          />
        ))}
      </ChipRow>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        key={cols}
        data={recipes}
        numColumns={cols}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        columnWrapperStyle={
          cols > 1 ? { gap: space.md, paddingHorizontal: layout.gutter } : undefined
        }
        contentContainerStyle={{ gap: space.lg, paddingBottom: space.huge * 2 }}
        ListEmptyComponent={
          <EmptyState
            emoji={query.trim() ? '🔍' : '🍳'}
            title={query.trim() ? t('allRecipes.noMatch') : t('allRecipes.empty')}
            action={query.trim() ? undefined : t('allRecipes.add')}
            onAction={query.trim() ? undefined : () => router.push('/add')}
          />
        }
        renderItem={({ item }) => (
          <View style={{ width: w }}>
            <RecipeCard
              variant="tile"
              zoom
              recipe={item.record}
              width={w}
              favorite={all.favs.has(item.id)}
              onToggleFavorite={() => {
                haptic.light();
                inBackground(repos.toggleFavorite(item.id));
              }}
              onPress={() => router.push(`/recipe/${item.id}`)}
            />
          </View>
        )}
        testID="all-recipes-list"
      />
    </SafeAreaView>
  );
}
