import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen } from '../ui';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Screen scroll={false}>
      <EmptyState
        emoji="🧭"
        title={t('errors.not_found')}
        action={t('tabs.home')}
        onAction={() => router.replace('/')}
      />
    </Screen>
  );
}
