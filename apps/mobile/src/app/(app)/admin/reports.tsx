import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRuntime } from '../../../hooks/runtime';
import { dateTime } from '../../../lib/dates';
import { errorMessage } from '../../../lib/errors';
import { space } from '../../../theme/tokens';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Segmented,
  Text,
  useToast,
} from '../../../ui';

interface Report {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  recipeId: string;
  recipeTitle: string;
  recipeVisibility: string;
  authorId: string;
}

export default function AdminReports() {
  const { t, i18n } = useTranslation();
  const rt = useRuntime();
  const toast = useToast();
  const [status, setStatus] = useState<'open' | 'resolved' | 'dismissed'>('open');
  const [items, setItems] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setItems((await rt.api.admin.reports(status)).items as unknown as Report[]);
    } catch (e) {
      setError(errorMessage(e, t));
    }
  }, [rt.api, status, t]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (
    r: Report,
    next: 'resolved' | 'dismissed',
    action: 'none' | 'unpublish' | 'unpublish_and_block',
  ) => {
    try {
      await rt.api.admin.handleReport(r.id, { status: next, action });
      void load();
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };
  const showUser = async (id: string) => {
    try {
      const u = (await rt.api.admin.user(id)) as Record<string, unknown>;
      Alert.alert(
        String(u.displayName),
        [
          u.email,
          `${t('admin.recipes')}: ${u.recipeCount}`,
          `${t('admin.publicRecipes')}: ${u.publicRecipeCount}`,
          `${t('admin.reports')}: ${u.reportsAgainst}`,
          u.canPublish ? '' : '🚫 publish',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };
  return (
    <FlatList
      data={items ?? []}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{
        padding: space.lg,
        gap: space.md,
        maxWidth: 800,
        width: '100%',
        alignSelf: 'center',
      }}
      ListHeaderComponent={
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'open', label: t('admin.open') },
            { value: 'resolved', label: t('admin.resolved') },
            { value: 'dismissed', label: t('admin.dismissed') },
          ]}
        />
      }
      renderItem={({ item: r }) => (
        <Card>
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              <Badge label={t(`community.reasons.${r.reason as 'spam'}`)} tone="danger" />
              <Badge label={r.recipeVisibility} />
            </View>
            <Text
              variant="bodyStrong"
              color="primary"
              onPress={() => router.push(`/community/${r.recipeId}`)}
              accessibilityRole="link"
            >
              {r.recipeTitle}
            </Text>
            {r.details ? <Text color="textMuted">“{r.details}”</Text> : null}
            <Text variant="caption" color="textSubtle">
              {t('admin.reportedAt', { date: dateTime(r.createdAt, i18n.language) })}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <Button
                title={t('admin.author')}
                size="sm"
                variant="secondary"
                onPress={() => void showUser(r.authorId)}
              />
              {r.status === 'open' ? (
                <>
                  <Button
                    title={t('admin.unpublish')}
                    size="sm"
                    onPress={() => void act(r, 'resolved', 'unpublish')}
                  />
                  <Button
                    title={t('admin.unpublishBlock')}
                    size="sm"
                    variant="danger"
                    onPress={() => void act(r, 'resolved', 'unpublish_and_block')}
                  />
                  <Button
                    title={t('admin.dismiss')}
                    size="sm"
                    variant="ghost"
                    onPress={() => void act(r, 'dismissed', 'none')}
                  />
                </>
              ) : null}
            </View>
          </View>
        </Card>
      )}
      ListEmptyComponent={
        error ? (
          <ErrorState message={error} onRetry={load} />
        ) : items === null ? (
          <LoadingState />
        ) : (
          <EmptyState emoji="✅" title={t('admin.empty')} />
        )
      }
    />
  );
}
