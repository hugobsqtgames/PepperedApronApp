import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { emptyDraft } from '@pepperedapron/core';
import { NetworkError } from '@pepperedapron/client';
import { openDraft, openTextDraft } from '../../../features/recipe/openDraft';
import { useRuntime } from '../../../hooks/runtime';
import { track } from '../../../services/analytics';
import { shareInbox, type SharedPayload } from '../../../services/shareInbox';
import { EmptyState, LoadingState, Screen } from '../../../ui';

/**
 * Entry point of the iOS Share Extension / Android share intent:
 * - a link (TikTok, Instagram, a website…) → server-side import of what is publicly available;
 * - an image → new recipe with that photo (optional on-device OCR from the photo screen);
 * - plain text → parsed into a draft.
 * The user always reviews the result in the editor.
 */
export default function SharedImport() {
  const { t } = useTranslation();
  const rt = useRuntime();
  const [payload] = useState<SharedPayload | null>(() => shareInbox.take());

  useEffect(() => {
    if (!payload) return;
    track('import_share_extension', { kind: payload.imageUri ? 'image' : payload.url ? 'url' : 'text' });
    const go = async () => {
      if (payload.imageUri) {
        router.replace({ pathname: '/import/photo', params: { uri: payload.imageUri } });
        return;
      }
      if (payload.url) {
        try {
          const res = await rt.api.importUrl(payload.url);
          // Text shared alongside the link (captions) complements what the page exposes.
          if (payload.text && payload.text.trim() !== payload.url && !res.draft.ingredients.length) {
            openTextDraft(payload.text.replace(payload.url, ''), { sourceUrl: payload.url, source: res.draft.source, imageUrl: res.draft.imageUrl, title: res.draft.title ?? payload.title }, res.completeness);
          } else {
            openDraft(res.draft, { notice: res.completeness });
          }
        } catch (e) {
          const d = emptyDraft();
          d.sourceUrl = payload.url;
          d.title = payload.title;
          if (payload.text && payload.text.trim() !== payload.url) {
            openTextDraft(payload.text.replace(payload.url, ''), { sourceUrl: payload.url, title: payload.title }, 'minimal');
          } else openDraft(d, { notice: 'minimal' });
          if (!(e instanceof NetworkError)) console.warn('[import] shared url failed');
        }
        return;
      }
      if (payload.text) openTextDraft(payload.text, { title: payload.title }, 'text');
    };
    void go();
  }, [payload, rt.api]);

  return (
    <Screen scroll={false} edges={['top', 'bottom']}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        {payload ? <LoadingState label={t('import.received')} /> : <EmptyState emoji="📥" title={t('errors.import_failed')} action={t('common.close')} onAction={() => router.back()} />}
      </View>
    </Screen>
  );
}
