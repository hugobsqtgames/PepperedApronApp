import { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SocialButtons } from '../../features/auth/SocialButtons';
import { errorMessage, isEmail } from '../../lib/errors';
import { runtime } from '../../services/runtime';
import { space } from '../../theme/tokens';
import { Button, Screen, Text, TextField } from '../../ui';
import { BrandHeader } from '../../features/auth/BrandHeader';

export default function SignIn() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((e: unknown) => setError(errorMessage(e, t)), [t]);

  const submit = async () => {
    setError(null);
    if (!isEmail(email)) return setError(t('errors.invalidEmail'));
    if (!password) return setError(t('errors.invalid_credentials'));
    try {
      const res = await runtime.api.login({ email: email.trim(), password, device: runtime.device() });
      await runtime.completeAuth(res);
    } catch (e) {
      onError(e);
    }
  };

  return (
    <Screen keyboard edges={['top', 'bottom']} maxWidth={480}>
      <BrandHeader title={t('auth.signInTitle')} />
      <View style={{ gap: space.lg }}>
        <SocialButtons onError={onError} />
        <TextField label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" testID="signin-email" />
        <TextField label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={() => void submit()} testID="signin-password" />
        {error ? (
          <Text variant="callout" color="danger" accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
        <Button title={t('auth.signIn')} size="lg" onPress={submit} testID="signin-submit" />
        <Button title={t('auth.forgot')} variant="ghost" onPress={() => router.push({ pathname: '/forgot-password', params: { email } })} />
        <Button title={t('auth.noAccount')} variant="secondary" onPress={() => router.replace('/sign-up')} />
        <LegalLinks />
      </View>
    </Screen>
  );
}

export function LegalLinks() {
  const { t } = useTranslation();
  const web = runtime.config?.legal;
  return (
    <View style={{ gap: space.xs, alignItems: 'center' }}>
      <Text variant="caption" color="textSubtle" align="center">
        {t('auth.legal')}
      </Text>
      {web ? (
        <View style={{ flexDirection: 'row', gap: space.lg }}>
          <Text variant="caption" color="primary" accessibilityRole="link" onPress={() => void Linking.openURL(web.terms)}>
            {t('auth.terms')}
          </Text>
          <Text variant="caption" color="primary" accessibilityRole="link" onPress={() => void Linking.openURL(web.privacy)}>
            {t('auth.privacy')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
