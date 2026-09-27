import { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, View } from 'react-native';
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

interface Message {
  id: string;
  email: string | null;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
  displayName: string | null;
  platform: string | null;
  appVersion: string | null;
}

export default function AdminMessages() {
  const { t, i18n } = useTranslation();
  const rt = useRuntime();
  const toast = useToast();
  const [status, setStatus] = useState<'new' | 'read' | 'answered' | 'closed'>('new');
  const [items, setItems] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setItems((await rt.api.admin.messages(status)).items as unknown as Message[]);
    } catch (e) {
      setError(errorMessage(e, t));
    }
  }, [rt.api, status, t]);
  useEffect(() => {
    void load();
  }, [load]);
  const set = async (m: Message, s: string) => {
    try {
      await rt.api.admin.setMessageStatus(m.id, s);
      void load();
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };
  return (
    <FlatList
      data={items ?? []}
      keyExtractor={(m) => m.id}
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
            { value: 'new', label: t('admin.statusNew') },
            { value: 'read', label: t('admin.statusRead') },
            { value: 'answered', label: t('admin.statusAnswered') },
            { value: 'closed', label: t('admin.statusClosed') },
          ]}
        />
      }
      renderItem={({ item: m }) => (
        <Card>
          <View style={{ gap: space.sm }}>
            <Text variant="bodyStrong">{m.subject}</Text>
            <Text>{m.message}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {m.displayName ? <Badge label={m.displayName} /> : null}
              {m.platform ? <Badge label={`${m.platform} ${m.appVersion ?? ''}`} /> : null}
            </View>
            <Text variant="caption" color="textSubtle">
              {dateTime(m.createdAt, i18n.language)} {m.email ? `· ${m.email}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {m.email ? (
                <Button
                  title="✉️"
                  size="sm"
                  variant="secondary"
                  onPress={() =>
                    void Linking.openURL(
                      `mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`,
                    )
                  }
                />
              ) : null}
              {m.status === 'new' ? (
                <Button
                  title={t('admin.markRead')}
                  size="sm"
                  variant="ghost"
                  onPress={() => void set(m, 'read')}
                />
              ) : null}
              {m.status !== 'answered' ? (
                <Button
                  title={t('admin.markAnswered')}
                  size="sm"
                  variant="ghost"
                  onPress={() => void set(m, 'answered')}
                />
              ) : null}
              {m.status !== 'closed' ? (
                <Button
                  title={t('admin.close')}
                  size="sm"
                  variant="ghost"
                  onPress={() => void set(m, 'closed')}
                />
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
          <EmptyState emoji="📭" title={t('admin.empty')} />
        )
      }
    />
  );
}
