import { useEffect, useMemo, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { openDraft } from '../../../features/recipe/openDraft';
import { draftFromLink } from '../../../lib/recipeLink';
import { EmptyState, Screen } from '../../../ui';

/**
 * A recipe QR code scanned with the Camera app (pepperedapron://r/<data>): the recipe is in the
 * link itself; it opens in the editor to be checked and saved.
 */
export default function RecipeFromLink() {
  const { t } = useTranslation();
  const { data } = useLocalSearchParams<{ data: string }>();
  const draft = useMemo(() => (data ? draftFromLink(data) : null), [data]);
  const opened = useRef(false);
  useEffect(() => {
    if (!draft || opened.current) return;
    opened.current = true;
    openDraft(draft, { notice: 'text' });
  }, [draft]);
  if (draft) return null;
  return (
    <Screen edges={['top', 'bottom']}>
      <EmptyState
        emoji="🔍"
        title={t('share.qrUnreadable')}
        action={t('common.close')}
        onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </Screen>
  );
}
