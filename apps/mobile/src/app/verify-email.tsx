import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../lib/errors';
import { runtime } from '../services/runtime';
import { EmptyState, LoadingState, Screen } from '../ui';

/** Opened from the confirmation e-mail. */
export default function VerifyEmail() {
  const { t } = useTranslation();
  const { token, kind } = useLocalSearchParams<{ token?: string; kind?: string }>();
  const [state, setState] = useState<'loading' | 'ok' | string>('loading');
  useEffect(() => {
    const run = async () => {
      try {
        if (kind === 'change') await runtime.api.request('POST', '/v1/auth/email/confirm-change', { token }, { auth: false });
        else await runtime.api.verifyEmail(token ?? '');
        runtime.updateUser({ emailVerified: true });
        void runtime.refreshRemote();
        setState('ok');
      } catch (e) {
        setState(errorMessage(e, t));
      }
    };
    void run();
  }, [token, kind, t]);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Screen scroll={false} edges={['top', 'bottom']}>
      {state === 'loading' ? <LoadingState /> : state === 'ok' ? <EmptyState emoji="✅" title={t('auth.emailVerified')} action={t('common.continue')} onAction={close} /> : <EmptyState emoji="⏳" title={state} action={t('common.close')} onAction={close} />}
    </Screen>
  );
}
