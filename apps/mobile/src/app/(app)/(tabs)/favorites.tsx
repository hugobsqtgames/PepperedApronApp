import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useLive, useRepos } from '../../../hooks/runtime';
import { tileWidth, useLayout } from '../../../lib/layout';
import { recipePhotoUri } from '../../../lib/media';
import { haptic } from '../../../services/haptics';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import {
  Button,
  EmptyState,
  IconButton,
  RecipeCard,
  RecipePhoto,
  Segmented,
  Text,
  TextField,
  longPressActions,
  useActionSheet,
} from '../../../ui';
import { inBackground } from '../../../lib/errors';

export default function Favorites() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const repos = useRepos();
  const layout = useLayout();
  const sheet = useActionSheet();
  const [tab, setTab] = useState<'favorites' | 'collections'>('favorites');
  const [newName, setNewName] = useState('');
  const data = useLive(
    ['favorite', 'recipe', 'collection', 'collectionItem', 'smartCollection', 'cookLog'],
    (r) => ({
      favorites: r.favoriteRecipes(),
      // Smart collections first: they fill themselves from their rules.
      collections: [
        ...r.smartCollections().map((c) => ({
          c: { id: c.id, data: { name: c.data.name, emoji: c.data.emoji } },
          recipes: r.smartCollectionRecipes(c.id),
          smart: true,
        })),
        ...r.collections().map((c) => ({ c, recipes: r.collectionRecipes(c.id), smart: false })),
      ],
    }),
  );
  const compact = useLive(['settings'], (r) => r.settings().compactLists);
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
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="title1" accessibilityRole="header" style={{ flex: 1 }}>
          {t('favorites.title')}
        </Text>
        {tab === 'favorites' ? (
          <IconButton
            icon={compact ? 'grid-outline' : 'list-outline'}
            label={compact ? t('compact.tiles') : t('compact.rows')}
            onPress={() => {
              haptic.selection();
              inBackground(repos.updateSettings({ compactLists: !compact }));
            }}
            testID="favorites-compact"
          />
        ) : null}
      </View>
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
      {tab === 'collections' ? (
        <Button
          title={t('smart.newTitle')}
          icon="sparkles-outline"
          variant="secondary"
          onPress={() => router.push('/collection/smart')}
          testID="new-smart-collection"
        />
      ) : null}
    </View>
  );

  if (tab === 'favorites') {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
        <FlatList
          key={compact ? 'f-rows' : `f${cols}`}
          data={data.favorites}
          numColumns={compact ? 1 : cols}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={header}
          columnWrapperStyle={
            !compact && cols > 1 ? { gap: space.md, paddingHorizontal: layout.gutter } : undefined
          }
          contentContainerStyle={{
            gap: compact ? space.xs : space.lg,
            paddingBottom: space.huge * 2,
          }}
          renderItem={({ item }) =>
            compact ? (
              <View style={{ paddingHorizontal: layout.gutter }}>
                <RecipeCard
                  recipe={item}
                  variant="row"
                  onPress={() => router.push(`/recipe/${item.id}`)}
                />
              </View>
            ) : (
              <RecipeCard
                zoom
                recipe={item}
                width={w}
                favorite
                onToggleFavorite={() => {
                  haptic.light();
                  inBackground(repos.toggleFavorite(item.id));
                }}
                onPress={() => router.push(`/recipe/${item.id}`)}
              />
            )
          }
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

  type Item = (typeof data.collections)[number];
  /** Long press (or VoiceOver action): a smart collection's rules, or delete a collection. */
  const more = (item: Item) =>
    item.smart
      ? router.push({ pathname: '/collection/smart', params: { id: item.c.id } })
      : sheet({
          title: item.c.data.name,
          options: [
            {
              label: t('favorites.deleteCollection'),
              icon: 'trash-outline',
              destructive: true,
              onPress: () =>
                Alert.alert(t('favorites.deleteCollection'), t('favorites.deleteCollectionBody'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: () => inBackground(repos.deleteCollection(item.c.id)),
                  },
                ]),
            },
          ],
        });

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
            onPress={() =>
              router.push({
                pathname: '/collection/[id]',
                params: item.smart ? { id: item.c.id, smart: '1' } : { id: item.c.id },
              })
            }
            {...longPressActions(t('common.more'), () => more(item))}
            onLongPress={() => more(item)}
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
