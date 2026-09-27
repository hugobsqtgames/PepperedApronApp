import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { computeTotalMinutes, formatMinutes, type Locale } from '@pepperedapron/core';
import type { Recipe } from '@pepperedapron/client';
import { recipePhotoUri } from '../lib/media';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Icon } from './Icon';
import { RecipePhoto } from './Photo';
import { Text } from './Text';

interface Props {
  recipe: Recipe;
  onPress: () => void;
  onLongPress?: () => void;
  variant?: 'tile' | 'wide' | 'row';
  width?: number;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  subtitle?: string;
  testID?: string;
}

function RecipeCardBase({ recipe, onPress, onLongPress, variant = 'tile', width, favorite, onToggleFavorite, subtitle, testID }: Props) {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const d = recipe.data;
  const total = computeTotalMinutes(d);
  const time = total ? formatMinutes(total, i18n.language as Locale) : null;
  const meta = [time, d.difficulty ? t(`difficulty.${d.difficulty}`) : null].filter(Boolean).join(' · ');
  const label = [d.title, meta, favorite ? t('recipe.favorite') : null, recipe.state !== 'synced' ? t('sync.itemPending') : null].filter(Boolean).join(', ');
  const uri = recipePhotoUri(recipe);

  const heart = onToggleFavorite ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={favorite ? t('recipe.unfavorite') : t('recipe.favorite')}
      accessibilityState={{ selected: !!favorite }}
      onPress={onToggleFavorite}
      hitSlop={10}
      style={[styles.heart, { backgroundColor: 'rgba(255,252,246,0.92)' }]}
    >
      <Icon name={favorite ? 'heart' : 'heart-outline'} size={18} tint={favorite ? colors.accent : '#1F2A24'} />
    </Pressable>
  ) : null;

  if (variant === 'row') {
    return (
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.85 : 1 }]}>
        <RecipePhoto uri={uri} category={d.category} radius={radius.md} style={styles.rowPhoto} emojiSize={26} recyclingKey={recipe.id} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {d.title}
          </Text>
          {subtitle || meta ? (
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {subtitle ?? meta}
            </Text>
          ) : null}
        </View>
        {recipe.state === 'error' ? <Icon name="alert-circle" size={18} color="danger" /> : recipe.state === 'pending' ? <Icon name="cloud-upload-outline" size={16} color="textSubtle" /> : null}
        <Icon name="chevron-forward" size={18} color="textSubtle" />
      </Pressable>
    );
  }

  const w = width ?? (variant === 'wide' ? 280 : 168);
  const h = variant === 'wide' ? Math.round(w * 0.62) : Math.round(w * 0.78);
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [{ width: w, gap: space.sm, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
      <View>
        <RecipePhoto uri={uri} category={d.category} radius={radius.xl} style={{ width: w, height: h }} emojiSize={variant === 'wide' ? 52 : 40} recyclingKey={recipe.id} />
        {heart}
        {recipe.state !== 'synced' ? (
          <View style={[styles.syncDot, { backgroundColor: recipe.state === 'error' ? colors.danger : colors.surfaceRaised }]} accessibilityElementsHidden>
            <Icon name={recipe.state === 'error' ? 'alert' : 'cloud-upload-outline'} size={12} tint={recipe.state === 'error' ? '#fff' : colors.textMuted} />
          </View>
        ) : null}
      </View>
      <View style={{ gap: 2, paddingHorizontal: 2 }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {d.title}
        </Text>
        {meta ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const RecipeCard = memo(RecipeCardBase);

const styles = StyleSheet.create({
  heart: { position: 'absolute', top: space.sm, right: space.sm, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  syncDot: { position: 'absolute', top: space.sm, left: space.sm, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, minHeight: 64 },
  rowPhoto: { width: 64, height: 64 },
});
