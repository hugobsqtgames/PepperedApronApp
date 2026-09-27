import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SocialButtons } from '../../features/auth/SocialButtons';
import { BrandHeader } from '../../features/auth/BrandHeader';
import { errorMessage, isEmail } from '../../lib/errors';
import { runtime } from '../../services/runtime';
import { space } from '../../theme/tokens';
import { Button, Screen, Text, TextField } from '../../ui';
import { LegalLinks } from './sign-in';

export default function SignUp() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    form?: string;
  }>({});
  const onError = useCallback((e: unknown) => setErrors({ form: errorMessage(e, t) }), [t]);

  const submit = async () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = t('errors.invalidField');
    if (!isEmail(email)) next.email = t('errors.invalidEmail');
    if (password.length < 10) next.password = t('errors.passwordTooShort');
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      const res = await runtime.api.register({
        email: email.trim(),
        password,
        displayName: name.trim(),
        locale: i18n.language,
        device: runtime.device(),
      });
      await runtime.completeAuth(res);
    } catch (e) {
      onError(e);
    }
  };

  return (
    <Screen keyboard edges={['top', 'bottom']} maxWidth={480}>
      <BrandHeader title={t('auth.signUpTitle')} />
      <View style={{ gap: space.lg }}>
        <SocialButtons onError={onError} />
        <TextField
          label={t('auth.displayName')}
          value={name}
          onChangeText={setName}
          autoComplete="given-name"
          textContentType="givenName"
          maxLength={80}
          error={errors.name}
          testID="signup-name"
        />
        <TextField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          error={errors.email}
          testID="signup-email"
        />
        <TextField
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          helper={t('auth.passwordHint')}
          error={errors.password}
          maxLength={128}
          testID="signup-password"
        />
        {errors.form ? (
          <Text variant="callout" color="danger" accessibilityLiveRegion="assertive">
            {errors.form}
          </Text>
        ) : null}
        <Button title={t('auth.signUp')} size="lg" onPress={submit} testID="signup-submit" />
        <Button
          title={t('auth.haveAccount')}
          variant="ghost"
          onPress={() => router.replace('/sign-in')}
        />
        <LegalLinks />
      </View>
    </Screen>
  );
}
