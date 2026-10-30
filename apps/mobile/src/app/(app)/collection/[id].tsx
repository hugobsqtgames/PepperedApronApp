import { Alert, FlatList, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLive, useRepos } from '../../../hooks/runtime';
import { printRecipes, shareRecipesPdf } from '../../../lib/print';
import { tileWidth, useLayout } from '../../../lib/layout';
import { haptic } from '../../../services/haptics';
import { useTheme } from '../../../theme/ThemeProvider';
import { space } from '../../../theme/tokens';
import { EmptyState, IconButton, RecipeCard, useActionSheet, usePrompt } from '../../../ui';

export default function CollectionScreen() {
  const { id, smart } = useLocalSearchParams<{ id: string; smart?: string }>();
  const isSmart = smart === '1';
  const { t } = useTranslation();
  const { colors } = useTheme();
  const repos = useRepos();
  const layout = useLayout();
  const sheet = useActionSheet();
  const prompt = usePrompt();
  const { col, recipes, favs, system } = useLive(
    [
      'collection',
      'collectionItem',
      'smartCollection',
      'recipe',
      'favorite',
      'cookLog',
      'settings',
    ],
    (r) => {
      // A smart collection fills itself from its rules.
      const sc = isSmart ? (r.smartCollections().find((c) => c.id === id) ?? null) : null;
      return {
        col: isSmart
          ? sc && { id: sc.id, data: { name: sc.data.name, emoji: sc.data.emoji } }
          : (r.collections().find((c) => c.id === id) ?? null),
        recipes: isSmart ? r.smartCollectionRecipes(id) : r.collectionRecipes(id),
        favs: new Set(r.favoriteRecipes().map((x) => x.id)),
        system: r.settings().unitSystem,
      };
    },
    [id, isSmart],
  );
  const cols = layout.sidebar ? Math.max(2, layout.columns - 1) : layout.columns;
  const w = tileWidth(
    layout.sidebar ? layout.width - 260 : layout.width,
    cols,
    space.md,
    layout.gutter,
  );

  if (!col)
    return (
      <EmptyState
        emoji="📁"
        title={t('errors.not_found')}
        action={t('common.back')}
        onAction={() => router.back()}
      />
    );

  const rename = () =>
    prompt({
      title: t('common.rename'),
      initial: col.data.name,
      maxLength: 80,
      onSubmit: (v) => void repos.updateCollection(col.id, { name: v.slice(0, 80) }),
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: `${col.data.emoji ? `${col.data.emoji} ` : ''}${col.data.name}`,
          headerRight: () => (
            <IconButton
              icon="ellipsis-horizontal"
              label={t('common.more')}
              variant="plain"
              onPress={() =>
                sheet({
                  options: [
                    ...(isSmart
                      ? [
                          {
                            label: t('smart.editTitle'),
                            icon: 'options-outline' as const,
                            onPress: () =>
                              router.push({
                                pathname: '/collection/smart',
                                params: { id: col.id },
                              }),
                          },
                        ]
                      : [
                          {
                            label: t('common.rename'),
                            icon: 'pencil-outline' as const,
                            onPress: rename,
                          },
                        ]),
                    ...(recipes.length
                      ? [
                          {
                            label: t('share.printBooklet'),
                            icon: 'print-outline' as const,
                            onPress: () =>
                              void printRecipes(recipes, system, col.data.name).catch(
                                () => undefined,
                              ),
                          },
                          {
                            label: t('share.pdfBooklet'),
                            icon: 'document-outline' as const,
                            onPress: () =>
                              void shareRecipesPdf(recipes, system, col.data.name).catch(
                                () => undefined,
                              ),
                          },
                        ]
                      : []),
                    ...(isSmart
                      ? []
                      : [
                          {
                            label: t('favorites.deleteCollection'),
                            icon: 'trash-outline' as const,
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
                                    onPress: async () => {
                                      await repos.deleteCollection(col.id);
                                      router.back();
                                    },
                                  },
                                ],
                              ),
                          },
                        ]),
                  ],
                })
              }
            />
          ),
        }}
      />
      <FlatList
        key={cols}
        data={recipes}
        numColumns={cols}
        keyExtractor={(r) => r.id}
        columnWrapperStyle={
          cols > 1 ? { gap: space.md, paddingHorizontal: layout.gutter } : undefined
        }
        contentContainerStyle={{ gap: space.lg, paddingVertical: space.lg }}
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            width={w}
            favorite={favs.has(item.id)}
            onToggleFavorite={() => {
              haptic.light();
              void repos.toggleFavorite(item.id);
            }}
            onPress={() => router.push(`/recipe/${item.id}`)}
            onLongPress={() =>
              !isSmart &&
              sheet({
                title: item.data.title,
                options: [
                  {
                    label: t('common.remove'),
                    icon: 'remove-circle-outline',
                    destructive: true,
                    onPress: () => void repos.setInCollection(col.id, item.id, false),
                  },
                ],
              })
            }
          />
        )}
        ListEmptyComponent={<EmptyState emoji="📭" title={t('favorites.emptyCollection')} />}
      />
    </View>
  );
}
