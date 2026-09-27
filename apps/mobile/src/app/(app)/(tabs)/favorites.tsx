import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useLive, useRepos } from '../../../hooks/runtime';
import { tileWidth, useLayout } from '../../../lib/layout';
import { recipePhotoUri } from '../../../lib/media';
import { track } from '../../../services/analytics';
import { haptic } from '../../../services/haptics';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import {
  Button,
  EmptyState,
  RecipeCard,
  RecipePhoto,
  Segmented,
  Text,
  TextField,
  useActionSheet,
} from '../../../ui';

export default function Favorites() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const repos = useRepos();
  const layout = useLayout();
  const sheet = useActionSheet();
  const [tab, setTab] = useState<'favorites' | 'collections'>('favorites');
  const [newName, setNewName] = useState('');
  const data = useLive(['favorite', 'recipe', 'collection', 'collectionItem'], (r) => ({
    favorites: r.favoriteRecipes(),
    collections: r.collections().map((c) => ({ c, recipes: r.collectionRecipes(c.id) })),
  }));
  const cols = layout.sidebar ? Math.max(2, layout.columns - 1) : layout.columns;
  const w = tileWidth(
    layout.sidebar ? layout.width - 260 : layout.width,
    cols,
    space.md,
    layout.gutter,
  );

  const createCollection = async () => {
    if (!newName.trim()) return;
    await repos.createCollection(newName.trim());
    track('collection_created');
    haptic.success();
    setNewName('');
  };

  const header = (
    <View
      style={{
        paddingHorizontal: layout.gutter,
        paddingTop: space.lg,
        gap: space.md,
        paddingBottom: space.md,
      }}
    >
      <Text variant="title1" accessibilityRole="header">
        {t('favorites.title')}
      </Text>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'favorites', label: t('favorites.all') },
          { value: 'collections', label: t('favorites.collections') },
        ]}
      />
      {tab === 'collections' ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <TextField
            containerStyle={{ flex: 1 }}
            placeholder={`${t('favorites.newCollection')} — ${t('favorites.collectionExamples')}`}
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={() => void createCollection()}
            maxLength={80}
            returnKeyType="done"
            testID="new-collection"
          />
          <Button
            title={t('common.create')}
            onPress={createCollection}
            disabled={!newName.trim()}
          />
        </View>
      ) : null}
    </View>
  );

  if (tab === 'favorites') {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
        <FlatList
          key={`f${cols}`}
          data={data.favorites}
          numColumns={cols}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={header}
          columnWrapperStyle={
            cols > 1 ? { gap: space.md, paddingHorizontal: layout.gutter } : undefined
          }
          contentContainerStyle={{ gap: space.lg, paddingBottom: space.huge * 2 }}
          renderItem={({ item }) => (
            <RecipeCard
              recipe={item}
              width={w}
              favorite
              onToggleFavorite={() => {
                haptic.light();
                void repos.toggleFavorite(item.id);
              }}
              onPress={() => router.push(`/recipe/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              emoji="💚"
              title={t('favorites.emptyTitle')}
              body={t('favorites.emptyBody')}
              action={t('tabs.search')}
              onAction={() => router.push('/search')}
            />
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        key={`c${cols}`}
        data={data.collections}
        numColumns={cols}
        keyExtractor={(x) => x.c.id}
        ListHeaderComponent={header}
        columnWrapperStyle={
          cols > 1 ? { gap: space.md, paddingHorizontal: layout.gutter } : undefined
        }
        contentContainerStyle={{ gap: space.lg, paddingBottom: space.huge * 2 }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.c.data.name}, ${t('common.recipes', { count: item.recipes.length })}`}
            onPress={() => router.push(`/collection/${item.c.id}`)}
            onLongPress={() =>
              sheet({
                title: item.c.data.name,
                options: [
                  {
                    label: t('favorites.deleteCollection'),
                    icon: 'trash-outline',
                    destructive: true,
                    onPress: () =>
                      Alert.alert(
                        t('favorites.deleteCollection'),
                        t('favorites.deleteCollectionBody'),
                        [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('common.delete'),
                            style: 'destructive',
                            onPress: () => void repos.deleteCollection(item.c.id),
                          },
                        ],
                      ),
                  },
                ],
              })
            }
            style={{ width: w, gap: space.sm }}
          >
            <View
              style={[
                styles.mosaic,
                { width: w, height: w * 0.8, backgroundColor: colors.surfaceMuted },
              ]}
            >
              {item.recipes.slice(0, 4).map((r) => (
                <RecipePhoto
                  key={r.id}
                  uri={recipePhotoUri(r)}
                  category={r.data.category}
                  style={{
                    width: item.recipes.length === 1 ? w : w / 2,
                    height: item.recipes.length <= 2 ? w * 0.8 : w * 0.4,
                  }}
                  emojiSize={24}
                />
              ))}
              {item.recipes.length === 0 ? (
                <Text style={{ fontSize: 34 }} maxFontSizeMultiplier={1}>
                  {item.c.data.emoji ?? '📁'}
                </Text>
              ) : null}
            </View>
            <View>
              <Text variant="bodyStrong" numberOfLines={1}>
                {item.c.data.emoji ? `${item.c.data.emoji} ` : ''}
                {item.c.data.name}
              </Text>
              <Text variant="caption" color="textMuted">
                {t('common.recipes', { count: item.recipes.length })}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState
            emoji="📚"
            title={t('favorites.emptyCollectionsTitle')}
            body={t('favorites.emptyCollectionsBody')}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mosaic: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
