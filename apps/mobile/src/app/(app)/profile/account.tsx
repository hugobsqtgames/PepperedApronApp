import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRuntime } from '../../../hooks/runtime';
import { errorMessage, isEmail } from '../../../lib/errors';
import { space } from '../../../theme/tokens';
import { Button, Group, Text, TextField, useToast } from '../../../ui';

export default function Account() {
  const { t } = useTranslation();
  const rt = useRuntime();
  const toast = useToast();
  const [name, setName] = useState(rt.user?.displayName ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const saveName = async () => {
    try {
      const u = await rt.api.updateMe({ displayName: name.trim() });
      rt.updateUser({ displayName: u.displayName });
      toast(t('common.done'));
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };
  const changeEmail = async () => {
    setEmailError(null);
    if (!isEmail(newEmail)) return setEmailError(t('errors.invalidEmail'));
    try {
      await rt.api.changeEmail(newEmail.trim(), rt.user?.hasPassword ? password : null);
      setNewEmail('');
      setPassword('');
      toast(t('settings.emailChangeSent'));
    } catch (e) {
      setEmailError(errorMessage(e, t));
    }
  };
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.xl, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
      <Group title={t('settings.displayName')}>
        <TextField value={name} onChangeText={setName} maxLength={80} containerStyle={{ padding: space.md }} />
      </Group>
      <Button title={t('common.save')} onPress={saveName} disabled={!name.trim() || name.trim() === rt.user?.displayName} />
      <Group title={t('settings.email')} footer={rt.user?.email}>
        <TextField containerStyle={{ padding: space.md }} label={t('settings.newEmail')} value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" error={emailError} />
        {rt.user?.hasPassword ? <TextField containerStyle={{ padding: space.md }} label={t('settings.passwordToConfirm')} value={password} onChangeText={setPassword} secureTextEntry /> : null}
      </Group>
      <Button title={t('settings.changeEmail')} variant="secondary" onPress={changeEmail} disabled={!newEmail.trim()} />
      {!rt.user?.emailVerified ? (
        <Text variant="callout" color="accent">
          {t('auth.verifyBanner')}
        </Text>
      ) : null}
    </ScrollView>
  );
}
