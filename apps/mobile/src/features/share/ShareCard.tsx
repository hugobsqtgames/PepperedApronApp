import { forwardRef } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  formatMinutes,
  computeTotalMinutes,
  type Locale,
  type UnitSystem,
} from '@pepperedapron/core';
import type { Recipe } from '@pepperedapron/client';
import { formatIngredient } from '../../lib/format';
import { recipePhotoUri } from '../../lib/media';
import { RecipePhoto, Text } from '../../ui';

/** Fixed colours: the image looks the same whatever the theme of whoever receives it. */
const C = {
  cream: '#F7F1E6',
  forest: '#1F4D3A',
  ink: '#1F2A24',
  muted: '#5E655F',
  paprika: '#D2642A',
};
export const CARD_WIDTH = 360;

/** The recipe as an image to share: photo, title, time, ingredients, the app's name. */
export const ShareCard = forwardRef<View, { recipe: Recipe; system: UnitSystem }>(
  function ShareCard({ recipe, system }, ref) {
    const { t, i18n } = useTranslation();
    const d = recipe.data;
    const locale = i18n.language as Locale;
    const minutes = computeTotalMinutes(d);
    const ings = d.ingredients.slice(0, 12);
    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        <RecipePhoto
          uri={recipePhotoUri(recipe)}
          category={d.category}
          style={{ width: CARD_WIDTH, height: 220 }}
        />
        <View style={styles.body}>
          <Text variant="title1" style={{ color: C.ink }}>
            {d.title}
          </Text>
          <Text variant="callout" style={{ color: C.muted }}>
            {[
              minutes ? formatMinutes(minutes, locale) : null,
              t('common.servings', { count: d.servings }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {ings.length ? (
            <View style={{ gap: 4, marginTop: 8 }}>
              {ings.map((i) => {
                const f = formatIngredient(i, 1, locale, system);
                return (
                  <Text key={i.id} variant="callout" style={{ color: C.ink }}>
                    <Text variant="callout" weight="700" style={{ color: C.paprika }}>
                      {f.amount ? `${f.amount} ` : '• '}
                    </Text>
                    {f.name}
                  </Text>
                );
              })}
              {d.ingredients.length > ings.length ? (
                <Text variant="caption" style={{ color: C.muted }}>
                  {t('share.moreIngredients', { count: d.ingredients.length - ings.length })}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={styles.footer}>
            <Image
              source={require('../../../assets/icon.png')}
              style={{ width: 22, height: 22, borderRadius: 5 }}
              accessibilityIgnoresInvertColors
            />
            <Text variant="caption" weight="700" style={{ color: C.forest }}>
              PepperedApron
            </Text>
          </View>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: { width: CARD_WIDTH, backgroundColor: C.cream, borderRadius: 24, overflow: 'hidden' },
  body: { padding: 20, gap: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
});
