import { useCallback, useEffect, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RemoteRecipe, type RemoteRecipeData } from '../../../features/recipe/RemoteRecipe';
import { useRuntime } from '../../../hooks/runtime';
import { errorMessage } from '../../../lib/errors';
import { haptic } from '../../../services/haptics';
import { Button, ErrorState, LoadingState, Screen, useToast } from '../../../ui';

/** Opened from a shared link (universal link /r/<token>). */
export default function SharedRecipe() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useTranslation();
  const rt = useRuntime();
  const toast = useToast();
  const [r, setR] = useState<(RemoteRecipeData & { isMine: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const res = (await rt.api.sharedRecipe(token)) as unknown as RemoteRecipeData & {
        isMine: boolean;
      };
      if (res.isMine) return router.replace(`/recipe/${res.id}`);
      setR(res);
    } catch (e) {
      setError(errorMessage(e, t));
    }
  }, [rt.api, t, token]);
  useEffect(() => {
    void load();
  }, [load]);
  if (error)
    return (
      <Screen scroll={false}>
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  if (!r)
    return (
      <Screen scroll={false}>
        <LoadingState />
      </Screen>
    );
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RemoteRecipe
        r={r}
        actions={
          <Button
            title={t('recipe.saveToLibrary')}
            icon="download-outline"
            size="lg"
            onPress={async () => {
              try {
                const { record } = await rt.api.saveSharedRecipe(token);
                haptic.success();
                toast(t('recipe.savedToLibrary'));
                await rt.session?.sync.sync();
                router.replace(`/recipe/${record.id}`);
              } catch (e) {
                toast(errorMessage(e, t), { tone: 'error' });
              }
            }}
          />
        }
      />
    </>
  );
}
