import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  DIET_TAGS,
  EMPTY_SMART_RULES,
  RECIPE_CATEGORIES,
  SEASONS,
  type SmartRules,
} from '@pepperedapron/core';
import { useRepos } from '../../../hooks/runtime';
import { errorMessage } from '../../../lib/errors';
import { haptic } from '../../../services/haptics';
import { space } from '../../../theme/tokens';
import { Button, Chip, IconButton, Screen, Text, TextField, useToast } from '../../../ui';

const TIMES = [15, 30, 45, 60];
const NOT_COOKED = [30, 60, 90, 180];

/**
 * A smart collection: rules instead of a hand-picked list (vegetarian under 30 min, desserts
 * rated 4★ or more, not cooked for 2 months…). It fills and empties itself.
 */
export default function SmartCollectionEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const repos = useRepos();
  const toast = useToast();
  const existing = id ? (repos.smartCollections().find((s) => s.id === id) ?? null) : null;
  const [name, setName] = useState(existing?.data.name ?? '');
  const [rules, setRules] = useState<SmartRules>(existing?.data.rules ?? EMPTY_SMART_RULES);
  const set = (p: Partial<SmartRules>) => setRules((r) => ({ ...r, ...p }));
  const count = (() => {
    // Live preview: how many recipes the rules select now.
    const tmp = { name: name || '·', emoji: null, rules };
    return repos.previewSmartCollection(tmp).length;
  })();

  const save = async () => {
    if (!name.trim()) return toast(t('smart.nameRequired'), { tone: 'error' });
    try {
      const rec = await repos.saveSmartCollection(existing?.id ?? null, {
        name: name.trim(),
        emoji: existing?.data.emoji ?? '✨',
        rules,
      });
      haptic.success();
      router.replace({ pathname: '/collection/[id]', params: { id: rec.id, smart: '1' } });
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  const row = (title: string, chips: React.ReactNode) => (
    <View style={{ gap: space.sm }}>
      <Text variant="bodyStrong">{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{chips}</View>
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640} keyboard>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: space.md }}>
        <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
          {existing ? t('smart.editTitle') : t('smart.newTitle')}
        </Text>
        <IconButton icon="close" label={t('common.close')} onPress={() => router.back()} />
      </View>
      <View style={{ gap: space.xl, paddingVertical: space.lg }}>
        <Text variant="callout" color="textMuted">
          {t('smart.hint')}
        </Text>
        <TextField
          label={t('smart.name')}
          placeholder={t('smart.namePlaceholder')}
          value={name}
          onChangeText={setName}
          maxLength={80}
        />
        {row(
          t('smart.diet'),
          DIET_TAGS.map((d) => (
            <Chip
              key={d}
              label={t(`diets.${d}`)}
              selected={rules.diet === d}
              onPress={() => set({ diet: rules.diet === d ? null : d })}
            />
          )),
        )}
        {row(
          t('smart.maxMinutes'),
          TIMES.map((m) => (
            <Chip
              key={m}
              label={t('smart.minutes', { count: m })}
              selected={rules.maxMinutes === m}
              onPress={() => set({ maxMinutes: rules.maxMinutes === m ? null : m })}
            />
          )),
        )}
        {row(
          t('smart.categories'),
          RECIPE_CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={t(`categories.${c}`)}
              selected={rules.categories.includes(c)}
              onPress={() =>
                set({
                  categories: rules.categories.includes(c)
                    ? rules.categories.filter((x) => x !== c)
                    : [...rules.categories, c],
                })
              }
            />
          )),
        )}
        {row(
          t('smart.season'),
          SEASONS.map((s) => (
            <Chip
              key={s}
              label={t(`seasons.${s}`)}
              selected={rules.season === s}
              onPress={() => set({ season: rules.season === s ? null : s })}
            />
          )),
        )}
        {row(
          t('smart.minRating'),
          [3, 4, 5].map((n) => (
            <Chip
              key={n}
              label={'★'.repeat(n)}
              selected={rules.minRating === n}
              onPress={() => set({ minRating: rules.minRating === n ? null : n })}
            />
          )),
        )}
        {row(
          t('smart.notCooked'),
          NOT_COOKED.map((d) => (
            <Chip
              key={d}
              label={t('smart.days', { count: d })}
              selected={rules.notCookedDays === d}
              onPress={() => set({ notCookedDays: rules.notCookedDays === d ? null : d })}
            />
          )),
        )}
        <Text variant="callout" color="textMuted">
          {t('smart.preview', { count })}
        </Text>
        <Button title={t('common.save')} icon="checkmark" onPress={() => void save()} />
        {existing ? (
          <Button
            title={t('smart.delete')}
            variant="ghost"
            onPress={() =>
              Alert.alert(t('smart.delete'), existing.data.name, [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: async () => {
                    await repos.deleteSmartCollection(existing.id);
                    router.dismissTo('/favorites');
                  },
                },
              ])
            }
          />
        ) : null}
      </View>
    </Screen>
  );
}
