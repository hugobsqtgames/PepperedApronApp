import { FlatList } from 'react-native';
import { router } from 'expo-router';
import type { Recipe, Repos } from '@pepperedapron/client';
import { useLayout } from '../../lib/layout';
import { haptic } from '../../services/haptics';
import { space } from '../../theme/tokens';
import { RecipeCard } from '../../ui';

export function RecipeCarousel({
  recipes,
  repos,
  wide,
  favorites,
  testID,
}: {
  recipes: Recipe[];
  repos: Repos;
  wide?: boolean;
  favorites: Set<string>;
  testID?: string;
}) {
  const layout = useLayout();
  return (
    <FlatList
      testID={testID}
      horizontal
      data={recipes}
      keyExtractor={(r) => r.id}
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -layout.gutter }}
      contentContainerStyle={{ gap: space.md, paddingHorizontal: layout.gutter }}
      renderItem={({ item }) => (
        <RecipeCard
          recipe={item}
          variant={wide ? 'wide' : 'tile'}
          width={wide ? (layout.isTablet ? 340 : 280) : layout.isTablet ? 210 : 168}
          favorite={favorites.has(item.id)}
          onToggleFavorite={() => {
            haptic.light();
            void repos.toggleFavorite(item.id);
          }}
          onPress={() => router.push(`/recipe/${item.id}`)}
        />
      )}
    />
  );
}
