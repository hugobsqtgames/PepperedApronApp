import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { EMPTY_FILTERS, searchRecipes } from '@pepperedapron/core';
import { useLive } from '../../hooks/runtime';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';
import { EmptyState, IconButton, Text, TextField } from '../../ui';

/** Choose a recipe with steps to cook alongside the others (a side, a dessert, a batch). */
export function RecipePicker({
  title,
  hint,
  exclude,
  onPick,
  onClose,
}: {
  title: string;
  hint?: string;
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
      <View style={styles.top}>
        <Text variant="title2" style={{ flex: 1 }} accessibilityRole="header">
          {title}
        </Text>
        <IconButton icon="close" label={t('common.close')} onPress={onClose} />
      </View>
      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
        {hint ? (
          <Text variant="callout" color="textMuted">
            {hint}
          </Text>
        ) : null}
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
              styles.row,
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

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
