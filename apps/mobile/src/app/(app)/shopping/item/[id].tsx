import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { parseNumber, resolveUnit } from '@pepperedapron/core';
import { useLive, useRepos } from '../../../../hooks/runtime';
import { aisleName } from '../../../../lib/aisles';
import { errorMessage } from '../../../../lib/errors';
import { space } from '../../../../theme/tokens';
import {
  Button,
  Chip,
  EmptyState,
  Text,
  TextField,
  useActionSheet,
  useToast,
} from '../../../../ui';

export default function ShoppingItemEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const repos = useRepos();
  const toast = useToast();
  const sheet = useActionSheet();
  const { item, categories, lists } = useLive(
    ['shoppingItem', 'shoppingCategory', 'shoppingList'],
    (r) => ({
      item:
        r.items(r.activeList()?.id ?? '').find((i) => i.id === id) ??
        r
          .lists()
          .flatMap((l) => r.items(l.id))
          .find((i) => i.id === id) ??
        null,
      categories: r.categories(),
      lists: r.lists(),
    }),
    [id],
  );
  const [name, setName] = useState(item?.data.name ?? '');
  const [qty, setQty] = useState(item?.data.quantity?.toString().replace('.', ',') ?? '');
  const [unit, setUnit] = useState(item?.data.unit ?? '');
  const [note, setNote] = useState(item?.data.note ?? '');
  const [aisle, setAisle] = useState(item?.data.categoryKey ?? 'other');
  if (!item)
    return (
      <EmptyState
        emoji="🧺"
        title={t('errors.not_found')}
        action={t('common.close')}
        onAction={() => router.back()}
      />
    );
  const custom = new Map(categories.map((c) => [c.key, c.name]));

  const save = async () => {
    try {
      const q = qty.trim() ? parseNumber(qty) : null;
      await repos.updateItem(item.id, {
        name: name.trim(),
        quantity: q && q > 0 ? q : null,
        unit: unit.trim() ? (resolveUnit(unit)?.key ?? unit.trim()) : null,
        note: note.trim() || null,
        categoryKey: aisle,
      });
      router.back();
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.xl, gap: space.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="title2" accessibilityRole="header">
        {t('shopping.editItem')}
      </Text>
      <TextField label={t('shopping.name')} value={name} onChangeText={setName} maxLength={200} />
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <TextField
          containerStyle={{ flex: 1 }}
          label={t('shopping.quantity')}
          value={qty}
          onChangeText={setQty}
          keyboardType="decimal-pad"
        />
        <TextField
          containerStyle={{ flex: 1 }}
          label={t('shopping.unit')}
          value={unit}
          onChangeText={setUnit}
          autoCapitalize="none"
          maxLength={24}
        />
      </View>
      <TextField label={t('editor.notes')} value={note} onChangeText={setNote} maxLength={200} />
      <Text variant="caption" color="textMuted" weight="600">
        {t('shopping.aisle')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {categories
          .filter((c) => !c.hidden)
          .map((c) => (
            <Chip
              key={c.key}
              label={aisleName(c.key, custom, t)}
              selected={aisle === c.key}
              onPress={() => setAisle(c.key)}
            />
          ))}
      </View>
      <Button title={t('common.save')} onPress={save} disabled={!name.trim()} />
      {lists.length > 1 ? (
        <Button
          title={t('shopping.moveToList')}
          variant="secondary"
          icon="arrow-redo-outline"
          onPress={() =>
            sheet({
              title: t('shopping.moveToList'),
              options: lists
                .filter((l) => l.id !== item.data.listId)
                .map((l) => ({
                  label: l.data.name,
                  onPress: async () => {
                    await repos.moveItemToList(item.id, l.id);
                    router.back();
                  },
                })),
            })
          }
        />
      ) : null}
      <Button
        title={t('common.delete')}
        variant="danger"
        icon="trash-outline"
        onPress={async () => {
          await repos.removeItem(item.id);
          router.back();
        }}
      />
    </ScrollView>
  );
}
