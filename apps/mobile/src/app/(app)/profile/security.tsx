import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRuntime } from '../../../hooks/runtime';
import { dateTime } from '../../../lib/dates';
import { errorMessage } from '../../../lib/errors';
import { space } from '../../../theme/tokens';
import { Button, ErrorState, Group, ListRow, LoadingState, TextField, useToast } from '../../../ui';

type Session = Awaited<ReturnType<ReturnType<typeof useRuntime>['api']['sessions']>>[number];

export default function Security() {
  const { t, i18n } = useTranslation();
  const rt = useRuntime();
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const load = useCallback(async () => {
    setError(null);
    try {
      setSessions(await rt.api.sessions());
    } catch (e) {
      setError(errorMessage(e, t));
    }
  }, [rt.api, t]);
  useEffect(() => {
    void load();
  }, [load]);

  const changePassword = async () => {
    if (next.length < 10) return toast(t('errors.passwordTooShort'), { tone: 'error' });
    try {
      await rt.api.changePassword(rt.user?.hasPassword ? current : null, next);
      setCurrent('');
      setNext('');
      rt.updateUser({ hasPassword: true });
      toast(t('settings.passwordChanged'));
      void load();
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: space.lg,
        gap: space.xl,
        maxWidth: 640,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      <Group title={t('settings.changePassword')}>
        {rt.user?.hasPassword ? (
          <TextField
            containerStyle={{ padding: space.md }}
            label={t('settings.currentPassword')}
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoComplete="current-password"
          />
        ) : null}
        <TextField
          containerStyle={{ padding: space.md }}
          label={t('settings.newPassword')}
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoComplete="new-password"
          helper={t('auth.passwordHint')}
        />
      </Group>
      <Button
        title={t('settings.changePassword')}
        variant="secondary"
        onPress={changePassword}
        disabled={!next}
      />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !sessions ? (
        <LoadingState />
      ) : (
        <Group title={t('settings.sessions')}>
          {sessions.map((s) => (
            <ListRow
              key={s.id}
              icon={
                s.platform === 'android'
                  ? 'logo-android'
                  : s.platform === 'ios'
                    ? 'phone-portrait-outline'
                    : 'desktop-outline'
              }
              title={`${s.deviceName ?? s.platform ?? '—'}${s.current ? ` · ${t('settings.thisDevice')}` : ''}`}
              subtitle={t('settings.lastUsed', { date: dateTime(s.lastUsedAt, i18n.language) })}
              right={
                !s.current ? (
                  <Button
                    title={t('settings.revoke')}
                    variant="ghost"
                    size="sm"
                    onPress={() =>
                      Alert.alert(t('settings.revoke'), s.deviceName ?? undefined, [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                          text: t('settings.revoke'),
                          style: 'destructive',
                          onPress: async () => {
                            await rt.api.revokeSession(s.id);
                            void load();
                          },
                        },
                      ])
                    }
                  />
                ) : undefined
              }
              chevron={false}
            />
          ))}
        </Group>
      )}
      {sessions && sessions.length > 1 ? (
        <Button
          title={t('settings.revokeOthers')}
          variant="danger"
          onPress={async () => {
            await rt.api.revokeOtherSessions();
            void load();
          }}
        />
      ) : null}
    </ScrollView>
  );
}
