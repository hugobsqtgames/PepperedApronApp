import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { errorMessage, isEmail } from '../../lib/errors';
import { runtime } from '../../services/runtime';
import { space } from '../../theme/tokens';
import { Button, Screen, Text, TextField } from '../../ui';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (!isEmail(email)) return setError(t('errors.invalidEmail'));
    try {
      await runtime.api.forgotPassword(email.trim());
      setSent(true);
    } catch (e) {
      setError(errorMessage(e, t));
    }
  };
  return (
    <Screen edges={['top', 'bottom']} keyboard maxWidth={480}>
      <View style={{ gap: space.lg, paddingTop: space.xxl }}>
        <Text variant="title1" accessibilityRole="header">
          {t('auth.forgotTitle')}
        </Text>
        <Text color="textMuted">{t('auth.forgotBody')}</Text>
        <TextField label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={error} />
        {sent ? (
          <Text color="primary" accessibilityLiveRegion="polite">
            {t('auth.linkSent')}
          </Text>
        ) : null}
        <Button title={t('auth.sendLink')} onPress={submit} disabled={sent} />
      </View>
    </Screen>
  );
}
