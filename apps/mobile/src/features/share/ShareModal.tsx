import { useRef, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useTranslation } from 'react-i18next';
import type { Recipe } from '@pepperedapron/client';
import type { UnitSystem } from '@pepperedapron/core';
import { recipeLink } from '../../lib/recipeLink';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';
import { Button, IconButton, QrCode, Text, useToast } from '../../ui';
import { CARD_WIDTH, ShareCard } from './ShareCard';

/**
 * Share a recipe as an image (photo, title, time, ingredients) or as a QR code holding the whole
 * recipe: scanned with the Camera app, it opens in PepperedApron on the other phone.
 */
export function ShareModal({
  recipe,
  mode,
  system,
  onClose,
}: {
  recipe: Recipe;
  mode: 'card' | 'qr' | null;
  system: UnitSystem;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();
  const card = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const link = mode === 'qr' ? recipeLink(recipe.data) : null;

  const shareImage = async () => {
    if (!card.current) return;
    setBusy(true);
    try {
      const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
    } catch {
      toast(t('share.failed'), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={mode !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: space.lg,
            gap: space.md,
          }}
        >
          <Text variant="title2" style={{ flex: 1 }} accessibilityRole="header">
            {mode === 'qr' ? t('share.qrTitle') : t('share.cardTitle')}
          </Text>
          <IconButton icon="close" label={t('common.close')} onPress={onClose} />
        </View>
        <ScrollView
          contentContainerStyle={{ alignItems: 'center', padding: space.lg, gap: space.lg }}
        >
          {mode === 'card' ? (
            <>
              <ShareCard ref={card} recipe={recipe} system={system} />
              <Button
                title={t('share.shareImage')}
                icon="share-outline"
                onPress={() => void shareImage()}
                loading={busy}
                style={{ alignSelf: 'stretch' }}
              />
            </>
          ) : mode === 'qr' ? (
            link ? (
              <>
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={t('share.qrLabel', { title: recipe.data.title })}
                  style={{ padding: space.lg, backgroundColor: '#FFFFFF', borderRadius: 24 }}
                >
                  <QrCode value={link.url} size={Math.min(CARD_WIDTH, 320)} />
                </View>
                <Text variant="callout" color="textMuted" align="center">
                  {t('share.qrHint')}
                </Text>
                {!link.complete ? (
                  <Text variant="caption" color="textMuted" align="center">
                    {t('share.qrPartial')}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text variant="body" align="center">
                {t('share.qrTooLong')}
              </Text>
            )
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
