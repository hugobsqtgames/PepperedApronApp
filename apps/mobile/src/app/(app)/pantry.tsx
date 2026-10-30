import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  formatShoppingQuantity,
  PANTRY_PLACES,
  toIsoDate,
  type Locale,
  type PantryPlace,
} from '@pepperedapron/core';
import { useLive, useRepos } from '../../hooks/runtime';
import { dayMonth } from '../../lib/dates';
import { errorMessage, inBackground } from '../../lib/errors';
import { haptic } from '../../services/haptics';
import { space } from '../../theme/tokens';
import {
  EmptyState,
  Group,
  IconButton,
  ListRow,
  Screen,
  Segmented,
  Text,
  TextField,
  useActionSheet,
  useToast,
  type IconName,
} from '../../ui';

const PLACE_ICONS: Record<PantryPlace, IconName> = {
  pantry: 'file-tray-stacked-outline',
  fridge: 'snow-outline',
  freezer: 'cube-outline',
};

/**
 * What is at home: the cupboard, the fridge, the freezer. Not bought again when the week is
 * added to the shopping list, and a reminder the day before something expires.
 */
export default function Pantry() {
  const { t, i18n } = useTranslation();
  const repos = useRepos();
  const sheet = useActionSheet();
  const toast = useToast();
  const [place, setPlace] = useState<PantryPlace>('pantry');
  const [text, setText] = useState('');
  const items = useLive(['pantryItem'], (r) => r.pantryItems(place), [place]);
  const today = toIsoDate(new Date());
  const locale = i18n.language as Locale;

  const add = async () => {
    const v = text.trim();
    if (!v) return;
    try {
      const r = await repos.addPantryText(v, place);
      if (!r) return;
      haptic.light();
      setText('');
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  const expiry = (iso: string | null) => {
    if (!iso) return undefined;
    if (iso < today) return t('pantry.expired');
    if (iso === today) return t('pantry.expiresToday');
    if (iso === addDays(today, 1)) return t('pantry.expiresTomorrow');
    return t('pantry.expiresOn', { date: dayMonth(iso, i18n.language) });
  };

  const actions = (id: string, name: string) =>
    sheet({
      title: name,
      options: [
        ...([1, 3, 7, 30] as const).map((d) => ({
          label: t('pantry.expiresIn', { count: d }),
          icon: 'calendar-outline' as const,
          onPress: () => inBackground(repos.updatePantryItem(id, { expiresOn: addDays(today, d) })),
        })),
        {
          label: t('pantry.noDate'),
          icon: 'remove-circle-outline',
          onPress: () => inBackground(repos.updatePantryItem(id, { expiresOn: null })),
        },
        ...PANTRY_PLACES.filter((p) => p !== place).map((p) => ({
          label: t('pantry.moveTo', { place: t(`pantry.places.${p}`) }),
          icon: PLACE_ICONS[p],
          onPress: () => inBackground(repos.updatePantryItem(id, { place: p })),
        })),
        {
          label: t('pantry.usedUp'),
          icon: 'checkmark-done-outline',
          destructive: true,
          onPress: () => inBackground(repos.removePantryItem(id)),
        },
      ],
    });

  return (
    <Screen scroll={false} edges={['top', 'bottom']} maxWidth={640}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: space.md }}>
        <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
          {t('pantry.title')}
        </Text>
        <IconButton icon="close" label={t('common.close')} onPress={() => router.back()} />
      </View>
      <ScrollView
        contentContainerStyle={{ gap: space.lg, paddingVertical: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="callout" color="textMuted">
          {t('pantry.hint')}
        </Text>
        <Segmented
          value={place}
          onChange={setPlace}
          options={PANTRY_PLACES.map((p) => ({ value: p, label: t(`pantry.places.${p}`) }))}
        />
        <TextField
          icon="add"
          placeholder={t('pantry.addPlaceholder')}
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => void add()}
          returnKeyType="done"
          submitBehavior="submit"
          testID="pantry-add"
        />
        {items.length ? (
          <Group>
            {items.map((p) => (
              <ListRow
                key={p.id}
                icon={PLACE_ICONS[p.data.place]}
                title={p.data.name}
                subtitle={expiry(p.data.expiresOn)}
                value={formatShoppingQuantity(p.data, locale) || undefined}
                danger={p.data.expiresOn !== null && p.data.expiresOn < today}
                onPress={() => actions(p.id, p.data.name)}
              />
            ))}
          </Group>
        ) : (
          <EmptyState emoji="🫙" title={t('pantry.emptyTitle')} body={t('pantry.emptyBody')} />
        )}
      </ScrollView>
    </Screen>
  );
}
