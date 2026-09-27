import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRuntime } from '../../../hooks/runtime';
import { errorMessage } from '../../../lib/errors';
import { space } from '../../../theme/tokens';
import { Card, ErrorState, Group, ListRow, LoadingState, Text } from '../../../ui';

interface Stats {
  users: { total: number; new7d: number; active7d: number; active30d: number };
  recipes: { total: number; public: number; created7d: number };
  favorites: number;
  mealPlanEntries30d: number;
  shoppingLists: number;
  openReports: number;
  newMessages: number;
  events30d: { name: string; n: number }[];
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card style={{ flexGrow: 1, flexBasis: 140 }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="title1">{value.toLocaleString()}</Text>
    </Card>
  );
}

export default function AdminHome() {
  const { t } = useTranslation();
  const rt = useRuntime();
  const [s, setS] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    try {
      setS((await rt.api.admin.stats()) as unknown as Stats);
    } catch (e) {
      setError(errorMessage(e, t));
    }
  }, [rt.api, t]);
  useEffect(() => {
    void load();
  }, [load]);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!s) return <LoadingState />;
  return (
    <ScrollView
      contentContainerStyle={{
        padding: space.lg,
        gap: space.xl,
        maxWidth: 900,
        width: '100%',
        alignSelf: 'center',
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Group>
        <ListRow
          icon="flag-outline"
          title={t('admin.reports')}
          value={String(s.openReports)}
          onPress={() => router.push('/admin/reports')}
        />
        <ListRow
          icon="mail-outline"
          title={t('admin.messages')}
          value={String(s.newMessages)}
          onPress={() => router.push('/admin/messages')}
        />
      </Group>
      <Text variant="title2">{t('admin.stats')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <Stat label={t('admin.users')} value={s.users.total} />
        <Stat label={t('admin.newUsers')} value={s.users.new7d} />
        <Stat label={t('admin.active')} value={s.users.active7d} />
        <Stat label={t('admin.recipes')} value={s.recipes.total} />
        <Stat label={t('admin.publicRecipes')} value={s.recipes.public} />
        <Stat label={t('favorites.title')} value={s.favorites} />
        <Stat label={t('planning.title')} value={s.mealPlanEntries30d} />
        <Stat label={t('shopping.lists')} value={s.shoppingLists} />
      </View>
      {s.events30d.length ? (
        <Group title={t('admin.events')}>
          {s.events30d.map((e) => (
            <ListRow key={e.name} title={e.name} value={String(e.n)} chevron={false} />
          ))}
        </Group>
      ) : null}
    </ScrollView>
  );
}
