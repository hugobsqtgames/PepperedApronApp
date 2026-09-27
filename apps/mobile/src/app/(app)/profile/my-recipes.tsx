import { FlatList } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLive, useRuntime } from '../../../hooks/runtime';
import { space } from '../../../theme/tokens';
import { EmptyState, RecipeCard } from '../../../ui';

export default function MyRecipes() {
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  const { t } = useTranslation();
  const rt = useRuntime();
  const recipes = useLive(
    ['recipe'],
    (r) =>
      r
        .library()
        .filter(
          (x) =>
            x.ownerId === rt.user?.id && (filter !== 'public' || x.data.visibility === 'public'),
        )
        .sort((a, b) => a.data.title.localeCompare(b.data.title)),
    [filter],
  );
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      data={recipes}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: space.lg }}
      renderItem={({ item }) => (
        <RecipeCard recipe={item} variant="row" onPress={() => router.push(`/recipe/${item.id}`)} />
      )}
      ListEmptyComponent={
        <EmptyState
          emoji="📖"
          title={filter === 'public' ? t('profile.emptyPublic') : t('profile.emptyMine')}
          action={filter === 'public' ? undefined : t('home.addFirst')}
          onAction={() => router.push('/add')}
        />
      }
    />
  );
}
