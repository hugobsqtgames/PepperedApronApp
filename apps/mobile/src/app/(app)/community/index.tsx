import { useCallback, useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { RecipeCategory } from '@pepperedapron/core';
import { NetworkError, type PublicRecipeCard } from '@pepperedapron/client';
import { useRuntime } from '../../../hooks/runtime';
import { errorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  RecipePhoto,
  Segmented,
  Text,
  TextField,
} from '../../../ui';

/** Public recipes: deliberately simple — recent / popular, search, no feed, no followers. */
export default function Community() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rt = useRuntime();
  const params = useLocalSearchParams<{ q?: string }>();
  const [sort, setSort] = useState<'recent' | 'popular'>('popular');
  const [q, setQ] = useState(params.q ?? '');
  const [items, setItems] = useState<PublicRecipeCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setItems((await rt.api.publicRecipes({ sort, q: q.trim() || undefined, limit: 40 })).items);
    } catch (e) {
      setItems(null);
      setError(e instanceof NetworkError ? t('community.offline') : errorMessage(e, t));
    }
  }, [rt.api, sort, q, t]);
  useEffect(() => {
    const id = setTimeout(() => void load(), q ? 350 : 0);
    return () => clearTimeout(id);
  }, [load, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: true, title: t('community.title') }} />
      <FlatList
        data={items ?? []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{
          padding: space.lg,
          gap: space.md,
          maxWidth: 760,
          width: '100%',
          alignSelf: 'center',
        }}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Segmented
              value={sort}
              onChange={setSort}
              options={[
                { value: 'popular', label: t('community.popular') },
                { value: 'recent', label: t('community.recent') },
              ]}
            />
            <TextField
              icon="search"
              value={q}
              onChangeText={setQ}
              placeholder={t('search.placeholder')}
              autoCorrect={false}
            />
          </View>
        }
        renderItem={({ item }) => (
          <Card
            padded={false}
            onPress={() => router.push(`/community/${item.id}`)}
            accessibilityLabel={`${item.title}, ${t('recipe.byAuthor', { name: item.authorName })}`}
          >
            <View
              style={{
                flexDirection: 'row',
                gap: space.md,
                padding: space.md,
                alignItems: 'center',
              }}
            >
              <RecipePhoto
                uri={item.photoUrl}
                category={(item.category as RecipeCategory) ?? null}
                radius={radius.md}
                style={{ width: 76, height: 76 }}
                emojiSize={30}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" numberOfLines={2}>
                  {item.title}
                </Text>
                <Text variant="caption" color="textMuted">
                  {t('recipe.byAuthor', { name: item.authorName })}
                </Text>
                <Text variant="caption" color="accent">
                  {t('community.saves', { count: item.saveCount })}
                </Text>
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          error ? (
            <ErrorState message={error} onRetry={load} />
          ) : items === null ? (
            <LoadingState />
          ) : (
            <EmptyState
              emoji="🌍"
              title={t('community.emptyTitle')}
              body={t('community.emptyBody')}
            />
          )
        }
      />
    </View>
  );
}
