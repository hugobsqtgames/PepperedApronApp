import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRuntime } from '../../../hooks/runtime';
import { errorMessage } from '../../../lib/errors';
import { track } from '../../../services/analytics';
import { space } from '../../../theme/tokens';
import { Button, EmptyState, Screen, Text } from '../../../ui';

/** Household invitation link (/join/<code>). Joining always requires an explicit tap. */
export default function JoinHousehold() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t } = useTranslation();
  const rt = useRuntime();
  const [error, setError] = useState<string | null>(null);
  if (rt.household) {
    return <Screen scroll={false}><EmptyState emoji="🏡" title={t('errors.already_in_household')} action={t('common.close')} onAction={() => router.replace('/profile/household')} /></Screen>;
  }
  return (
    <Screen edges={['top', 'bottom']} maxWidth={480}>
      <View style={{ gap: space.lg, paddingTop: space.huge, alignItems: 'center' }}>
        <Text style={{ fontSize: 56 }} maxFontSizeMultiplier={1}>
          🏡
        </Text>
        <Text variant="title1" align="center">
          {t('household.join')}
        </Text>
        <Text color="textMuted" align="center">
          {t('household.intro')}
        </Text>
        <Text variant="title2" style={{ letterSpacing: 4 }}>
          {code}
        </Text>
        {error ? <Text color="danger">{error}</Text> : null}
        <Button
          title={t('household.join')}
          full
          onPress={async () => {
            try {
              const r = await rt.api.joinHousehold(code);
              await rt.setHousehold(r.household);
              track('household_joined');
              router.replace('/profile/household');
            } catch (e) {
              setError(errorMessage(e, t));
            }
          }}
        />
        <Button title={t('common.cancel')} variant="ghost" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}
