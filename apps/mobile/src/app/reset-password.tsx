import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../lib/errors';
import { runtime } from '../services/runtime';
import { space } from '../theme/tokens';
import { Button, Screen, Text, TextField } from '../ui';

/** Opened from the e-mail link (universal link). */
export default function ResetPassword() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (password.length < 10) return setError(t('errors.passwordTooShort'));
    try {
      await runtime.api.resetPassword(token ?? '', password);
      setDone(true);
    } catch (e) {
      setError(errorMessage(e, t));
    }
  };
  return (
    <Screen edges={['top', 'bottom']} keyboard maxWidth={480}>
      <View style={{ gap: space.lg, paddingTop: space.xxl }}>
        <Text variant="title1" accessibilityRole="header">
          {t('auth.resetTitle')}
        </Text>
        {done ? (
          <>
            <Text color="primary">{t('auth.resetDone')}</Text>
            <Button title={t('common.continue')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          </>
        ) : (
          <>
            <TextField label={t('settings.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" helper={t('auth.passwordHint')} error={error} />
            <Button title={t('common.save')} onPress={submit} />
          </>
        )}
      </View>
    </Screen>
  );
}
