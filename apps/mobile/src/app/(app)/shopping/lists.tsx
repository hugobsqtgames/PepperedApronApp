import { Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLive, useRepos } from '../../../hooks/runtime';
import { haptic } from '../../../services/haptics';
import { space } from '../../../theme/tokens';
import { Button, Group, ListRow, Text, useActionSheet, usePrompt } from '../../../ui';

/** Many lists, but always one clearly active list. */
export default function ShoppingLists() {
  const { t } = useTranslation();
  const repos = useRepos();
  const sheet = useActionSheet();
  const prompt = usePrompt();
  const { lists, active, counts } = useLive(['shoppingList', 'shoppingItem', 'settings'], (r) => ({
    lists: r.lists(),
    active: r.activeList()?.id ?? null,
    counts: new Map(
      r.lists().map((l) => [l.id, r.items(l.id).filter((i) => !i.data.checked).length]),
    ),
  }));
  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
      <Text variant="title2" accessibilityRole="header">
        {t('shopping.lists')}
      </Text>
      {lists.length ? (
        <Group>
          {lists.map((l) => (
            <ListRow
              key={l.id}
              icon={l.id === active ? 'checkmark-circle' : 'list-outline'}
              title={`${l.data.emoji ? `${l.data.emoji} ` : ''}${l.data.name}`}
              subtitle={[
                t('shopping.remaining', { count: counts.get(l.id) ?? 0 }),
                l.data.householdId ? t('shopping.shared') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              right={
                l.id === active ? (
                  <Text variant="micro" color="primary">
                    {t('shopping.active').toUpperCase()}
                  </Text>
                ) : undefined
              }
              onPress={() => {
                haptic.selection();
                void repos.setActiveList(l.id);
                router.back();
              }}
              chevron={false}
            />
          ))}
        </Group>
      ) : (
        <Text color="textMuted">{t('shopping.noList')}</Text>
      )}
      <Button
        title={t('shopping.newList')}
        icon="add"
        onPress={() =>
          prompt({
            title: t('shopping.newList'),
            placeholder: t('shopping.listExamples'),
            maxLength: 80,
            onSubmit: (v) => void repos.createList(v).then(() => router.back()),
          })
        }
        testID="new-list"
      />
      {lists.length ? (
        <Button
          title={t('common.edit')}
          variant="ghost"
          icon="create-outline"
          onPress={() =>
            sheet({
              options: lists.map((l) => ({
                label: l.data.name,
                onPress: () =>
                  setTimeout(
                    () =>
                      sheet({
                        title: l.data.name,
                        options: [
                          {
                            label: t('shopping.renameList'),
                            icon: 'pencil-outline',
                            onPress: () =>
                              prompt({
                                title: t('shopping.renameList'),
                                initial: l.data.name,
                                maxLength: 80,
                                onSubmit: (v) => void repos.updateList(l.id, { name: v }),
                              }),
                          },
                          {
                            label: t('common.delete'),
                            icon: 'trash-outline',
                            destructive: true,
                            onPress: () =>
                              Alert.alert(t('shopping.deleteList'), t('shopping.deleteListBody'), [
                                { text: t('common.cancel'), style: 'cancel' },
                                {
                                  text: t('common.delete'),
                                  style: 'destructive',
                                  onPress: () => void repos.deleteList(l.id),
                                },
                              ]),
                          },
                        ],
                      }),
                    350,
                  ),
              })),
            })
          }
        />
      ) : null}
    </ScrollView>
  );
}
