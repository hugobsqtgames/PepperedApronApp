import { useEffect, useRef } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useImportQueue } from '../../../hooks/importQueue';
import { useLayout } from '../../../lib/layout';
import type { ImportSource } from '../../../services/autoImport';
import { importQueue, type ImportJob } from '../../../services/importQueue';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, space } from '../../../theme/tokens';
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  LoadingState,
  longPressActions,
  Screen,
  Text,
  useToast,
  type IconName,
} from '../../../ui';

function sourceLabel(s: ImportSource, t: TFunction): string {
  if (s.kind === 'link') {
    try {
      const u = new URL(s.url);
      return `${u.hostname.replace(/^www\./, '')}${u.pathname.length > 1 ? u.pathname : ''}`;
    } catch {
      return s.url;
    }
  }
  if (s.kind === 'photos') return t('import.photosCount', { count: s.uris.length });
  if (s.kind === 'video') return t('import.videoFile');
  if (s.kind === 'pdf') return t('import.pdfFile');
  return (
    s.text
      .split('\n')
      .find((l) => l.trim())
      ?.slice(0, 80) ?? t('import.textShared')
  );
}

function stageLabel(j: ImportJob, t: TFunction): string {
  if (j.stage === 'listening') return t('import.listening');
  if (j.stage === 'reading') return t('import.reading');
  if (j.stage === 'saving') return t('import.saving');
  return t('import.fetching');
}

/** The app the link came from, to go back to it and share the next recipe. */
function sourceApp(jobs: ImportJob[]): { name: string; url: string } | null {
  const link = jobs.find((j) => j.source.kind === 'link')?.source;
  if (link?.kind !== 'link') return null;
  if (/instagram\.com/i.test(link.url)) return { name: 'Instagram', url: 'instagram://' };
  if (/tiktok\.com/i.test(link.url)) return { name: 'TikTok', url: 'snssdk1233://' };
  if (/youtu\.?be/i.test(link.url)) return { name: 'YouTube', url: 'youtube://' };
  return null;
}

/**
 * Progress of what was shared to the app. One recipe: it opens as soon as it is saved. Several
 * (a list of links, an Instagram export): the list of imports, each one opening its recipe.
 */
export default function ImportQueueScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const layout = useLayout();
  const toast = useToast();
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const state = useImportQueue();
  const wanted = ids ? new Set(ids.split(',')) : null;
  const jobs = wanted ? state.jobs.filter((j) => wanted.has(j.id)) : state.jobs;
  const single = wanted !== null && jobs.length === 1 ? jobs[0]! : null;
  const opened = useRef(false);
  const running = state.jobs.some((j) => j.status === 'pending' || j.status === 'running');

  // VoiceOver: say when every import is finished.
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running && state.jobs.length)
      AccessibilityInfo.announceForAccessibility(
        t('import.finished', {
          count: state.jobs.filter((j) => j.status === 'done').length,
        }),
      );
    wasRunning.current = running;
  }, [running, state.jobs, t]);

  // Imports only progress while the app is open: keep the screen on until they are done.
  useEffect(() => {
    if (!running) return;
    void activateKeepAwakeAsync('imports').catch(() => undefined);
    return () => void deactivateKeepAwake('imports').catch(() => undefined);
  }, [running]);

  useEffect(() => {
    if (!single || opened.current) return;
    if (single.status !== 'done' && single.status !== 'duplicate') return;
    opened.current = true;
    router.replace(`/recipe/${single.recipeId}`);
    if (single.status === 'done') toast(t('import.savedToast'));
    else
      toast(t('import.duplicateToast'), {
        tone: 'info',
        action: {
          label: t('import.saveAnyway'),
          onPress: () => {
            void importQueue.saveAnyway(single.id);
            toast(t('import.savingCopy'), { tone: 'info' });
          },
        },
      });
  }, [single, t, toast]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const back = sourceApp(jobs);
  const goBack = back ? () => void Linking.openURL(back.url).catch(() => undefined) : undefined;

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: space.md }}>
      <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
        {t('import.queueTitle')}
      </Text>
      <IconButton icon="close" label={t('common.close')} onPress={close} />
    </View>
  );

  const pause =
    state.pauseReason && state.pausedUntil > Date.now() ? (
      <View style={[styles.banner, { backgroundColor: colors.accentSoft }]}>
        <Icon
          name={state.pauseReason === 'offline' ? 'cloud-offline-outline' : 'hourglass-outline'}
          size={20}
          color="accent"
        />
        <Text variant="callout" style={{ flex: 1 }}>
          {state.pauseReason === 'offline'
            ? t('import.pausedOffline')
            : t('import.pausedBlocked', {
                time: new Date(state.pausedUntil).toLocaleTimeString(i18n.language, {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
        </Text>
      </View>
    ) : null;

  // ---------------------------------------------------------------- one shared recipe
  if (single) {
    const failed = single.status === 'failed';
    return (
      <Screen scroll={false} edges={['top', 'bottom']} maxWidth={560}>
        {header}
        {pause}
        <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
          {failed ? (
            <EmptyState
              emoji="😕"
              title={t('import.failedTitle')}
              body={t('import.failedBody')}
              action={t('common.retry')}
              onAction={() => void importQueue.retryFailed()}
              secondary={t('common.close')}
              onSecondary={close}
            />
          ) : (
            <>
              <LoadingState
                label={single.status === 'running' ? stageLabel(single, t) : t('import.waiting')}
              />
              <Text variant="callout" color="textMuted" align="center">
                {t('import.autoSaveHint')}
              </Text>
            </>
          )}
        </View>
      </Screen>
    );
  }

  // ---------------------------------------------------------------- several imports
  const done = jobs.filter((j) => j.status === 'done').length;
  const dup = jobs.filter((j) => j.status === 'duplicate').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;
  const left = jobs.filter((j) => j.status === 'pending' || j.status === 'running').length;

  const row = ({ item: j }: { item: ImportJob }) => {
    const icon: IconName =
      j.status === 'done'
        ? 'checkmark-circle'
        : j.status === 'duplicate'
          ? 'copy-outline'
          : j.status === 'failed'
            ? 'alert-circle-outline'
            : 'time-outline';
    const tint =
      j.status === 'done'
        ? colors.primary
        : j.status === 'failed'
          ? colors.danger
          : colors.textSubtle;
    const subtitle =
      j.status === 'running'
        ? stageLabel(j, t)
        : j.status === 'duplicate'
          ? t('import.alreadySaved')
          : j.status === 'failed'
            ? j.error === 'blocked'
              ? t('import.errorBlocked')
              : j.error === 'offline'
                ? t('import.errorOffline')
                : t('import.errorFailed')
            : j.status === 'done' && j.notice && j.notice !== 'full'
              ? t('import.toCheck')
              : j.collection
                ? `📁 ${j.collection}`
                : null;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[j.title ?? sourceLabel(j.source, t), subtitle]
          .filter(Boolean)
          .join(', ')}
        disabled={!j.recipeId}
        onPress={() => j.recipeId && router.push(`/recipe/${j.recipeId}`)}
        onLongPress={() => j.status === 'duplicate' && void importQueue.saveAnyway(j.id)}
        {...longPressActions(
          t('import.saveAnyway'),
          j.status === 'duplicate' ? () => void importQueue.saveAnyway(j.id) : null,
        )}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: colors.line, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        {j.status === 'running' ? (
          <ActivityIndicator color={colors.primary} style={{ width: 24 }} />
        ) : (
          <Icon name={icon} size={24} tint={tint} />
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" numberOfLines={1}>
            {j.title ?? sourceLabel(j.source, t)}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {j.recipeId ? <Icon name="chevron-forward" size={18} color="textSubtle" /> : null}
      </Pressable>
    );
  };

  return (
    <Screen scroll={false} edges={['top', 'bottom']} maxWidth={640}>
      {header}
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        renderItem={row}
        contentContainerStyle={{ paddingBottom: space.huge, gap: 0 }}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingVertical: space.md }}>
            {jobs.length ? (
              <Text variant="bodyStrong">
                {left
                  ? t('import.progress', { done: done + dup, total: jobs.length })
                  : t('import.finished', { count: done })}
              </Text>
            ) : null}
            {pause}
            {left ? (
              <View style={[styles.banner, { backgroundColor: colors.primarySoft }]}>
                <Icon name="information-circle-outline" size={20} color="primary" />
                <Text variant="callout" style={{ flex: 1 }}>
                  {t('import.queueTip')}
                </Text>
              </View>
            ) : null}
            {goBack && back ? (
              <Button
                title={t('import.backTo', { app: back.name })}
                icon="arrow-undo-outline"
                variant="secondary"
                onPress={goBack}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState emoji="📥" title={t('import.queueEmpty')} body={t('add.shareTip')} />
        }
        ListFooterComponent={
          jobs.length ? (
            <View style={{ gap: space.sm, paddingTop: space.lg, paddingHorizontal: layout.gutter }}>
              {failedCount ? (
                <Button
                  title={t('import.retryFailed', { count: failedCount })}
                  icon="refresh"
                  onPress={() => importQueue.retryFailed()}
                />
              ) : null}
              {dup ? (
                <Text variant="caption" color="textMuted" align="center">
                  {t('import.duplicatesHint')}
                </Text>
              ) : null}
              {!left ? (
                <Button
                  title={t('import.clearList')}
                  variant="ghost"
                  onPress={() => importQueue.clearFinished()}
                />
              ) : null}
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
