import { FlatList } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLive } from '../../../hooks/runtime';
import { space } from '../../../theme/tokens';
import { EmptyState, RecipeCard } from '../../../ui';

export default function MyRecipes() {
  const { t } = useTranslation();
  const recipes = useLive(['recipe'], (r) =>
    r.recipes().sort((a, b) => a.data.title.localeCompare(b.data.title)),
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
          title={t('profile.emptyMine')}
          action={t('home.addFirst')}
          onAction={() => router.push('/add')}
        />
      }
    />
  );
}
