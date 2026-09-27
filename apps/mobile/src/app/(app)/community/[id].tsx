import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { REPORT_REASONS } from '@pepperedapron/core';
import { RemoteRecipe, type RemoteRecipeData } from '../../../features/recipe/RemoteRecipe';
import { useLive, useRepos, useRuntime } from '../../../hooks/runtime';
import { errorMessage } from '../../../lib/errors';
import { haptic } from '../../../services/haptics';
import { space } from '../../../theme/tokens';
import { Button, ErrorState, LoadingState, Screen, useActionSheet, usePrompt, useToast } from '../../../ui';

export default function PublicRecipe() {
  const { id, report } = useLocalSearchParams<{ id: string; report?: string }>();
  const { t } = useTranslation();
  const rt = useRuntime();
  const repos = useRepos();
  const toast = useToast();
  const sheet = useActionSheet();
  const prompt = usePrompt();
  const [r, setR] = useState<RemoteRecipeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fav = useLive(['favorite'], (x) => x.isFavorite(id), [id]);
  const load = useCallback(async () => {
    setError(null);
    try {
      setR((await rt.api.publicRecipe(id)) as unknown as RemoteRecipeData);
    } catch (e) {
      setError(errorMessage(e, t));
    }
  }, [id, rt.api, t]);
  useEffect(() => {
    void load();
  }, [load]);

  const reportFlow = useCallback(
    () =>
      sheet({
        title: t('community.reportTitle'),
        options: REPORT_REASONS.map((reason) => ({
          label: t(`community.reasons.${reason}`),
          onPress: () =>
            prompt({
              title: t('community.reportTitle'),
              message: t('community.reportDetails'),
              multiline: true,
              maxLength: 1000,
              confirm: t('recipe.report'),
              onSubmit: async (details) => {
                try {
                  await rt.api.reportRecipe(id, reason, details);
                  toast(t('community.reported'));
                } catch (e) {
                  toast(errorMessage(e, t), { tone: 'error' });
                }
              },
            }),
        })),
      }),
    [id, prompt, rt.api, sheet, t, toast],
  );
  useEffect(() => {
    if (report && r) setTimeout(reportFlow, 400);
  }, [report, r, reportFlow]);

  if (error) return <Screen scroll={false}><ErrorState message={error} onRetry={load} /></Screen>;
  if (!r) return <Screen scroll={false}><LoadingState /></Screen>;
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RemoteRecipe
        r={r}
        actions={
          <View style={{ gap: space.sm }}>
            <Button
              title={t('recipe.saveToLibrary')}
              icon="download-outline"
              size="lg"
              onPress={async () => {
                try {
                  const { record } = await rt.api.savePublicRecipe(id);
                  haptic.success();
                  toast(t('recipe.savedToLibrary'));
                  rt.syncNow();
                  await rt.session?.sync.sync();
                  router.replace(`/recipe/${record.id}`);
                } catch (e) {
                  toast(errorMessage(e, t), { tone: 'error' });
                }
              }}
              testID="save-public"
            />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title={fav ? t('recipe.unfavorite') : t('recipe.favorite')} icon={fav ? 'heart' : 'heart-outline'} variant="secondary" style={{ flex: 1 }} onPress={async () => { haptic.light(); await repos.toggleFavorite(id); }} />
              <Button title={t('recipe.report')} icon="flag-outline" variant="ghost" onPress={reportFlow} />
            </View>
          </View>
        }
      />
    </>
  );
}
