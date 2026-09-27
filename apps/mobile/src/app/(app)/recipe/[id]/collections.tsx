import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLive, useRepos } from '../../../../hooks/runtime';
import { track } from '../../../../services/analytics';
import { haptic } from '../../../../services/haptics';
import { space } from '../../../../theme/tokens';
import { Button, Group, ListRow, Text, TextField } from '../../../../ui';

export default function RecipeCollections() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const repos = useRepos();
  const [name, setName] = useState('');
  const { collections, inside } = useLive(['collection', 'collectionItem'], (r) => ({ collections: r.collections(), inside: new Set(r.collectionsOf(id)) }), [id]);
  const create = async () => {
    if (!name.trim()) return;
    const c = await repos.createCollection(name.trim());
    await repos.setInCollection(c.id, id, true);
    track('collection_created');
    haptic.success();
    setName('');
  };
  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
      <Text variant="title2" accessibilityRole="header">
        {t('favorites.addTo')}
      </Text>
      {collections.length ? (
        <Group>
          {collections.map((c) => (
            <ListRow key={c.id} title={`${c.data.emoji ?? '📁'}  ${c.data.name}`} toggle={inside.has(c.id)} onToggle={(v) => { haptic.selection(); void repos.setInCollection(c.id, id, v); }} />
          ))}
        </Group>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        <TextField containerStyle={{ flex: 1 }} placeholder={t('favorites.newCollection')} value={name} onChangeText={setName} onSubmitEditing={() => void create()} maxLength={80} returnKeyType="done" />
        <Button title={t('common.create')} onPress={create} disabled={!name.trim()} />
      </View>
      <Button title={t('common.done')} variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}
