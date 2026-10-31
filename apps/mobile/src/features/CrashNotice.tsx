import { useEffect, useState } from 'react';
import { Modal, ScrollView, Share, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { onCrash, recordCrash, reportOf, type CrashReport } from '../lib/crashGuard';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Button, Text } from '../ui';

const detailOf = (r: CrashReport) =>
  `${r.message}\n${r.at}${r.where ? ` · ${r.where}` : ''}\n\n${r.stack}`;

/** The error, in small, and a way to send it: what is needed to fix it. */
function Detail({ report }: { report: CrashReport }) {
  const { colors } = useTheme();
  return (
    <ScrollView
      style={{ maxHeight: 140, backgroundColor: colors.surfaceMuted, borderRadius: radius.md }}
      contentContainerStyle={{ padding: space.md }}
    >
      <Text variant="caption" color="textMuted" selectable>
        {report.message}
      </Text>
    </ScrollView>
  );
}

/**
 * Shown over everything when an error nothing caught happened (instead of the app closing):
 * the app goes on, and the detail can be sent.
 */
export function CrashNotice() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [report, setReport] = useState<CrashReport | null>(null);
  useEffect(() => onCrash(setReport), []);
  if (!report) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setReport(null)}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: space.xl,
          backgroundColor: 'rgba(0,0,0,0.4)',
        }}
      >
        <View
          style={{
            gap: space.md,
            padding: space.xl,
            borderRadius: radius.xl,
            backgroundColor: colors.background,
          }}
          accessibilityViewIsModal
        >
          <Text variant="title2" accessibilityRole="header">
            {t('crash.title')}
          </Text>
          <Text variant="callout" color="textMuted">
            {t('crash.body')}
          </Text>
          <Detail report={report} />
          <Button
            title={t('crash.send')}
            icon="share-outline"
            variant="secondary"
            onPress={() => void Share.share({ message: detailOf(report) })}
          />
          <Button title={t('crash.continue')} onPress={() => setReport(null)} />
        </View>
      </View>
    </Modal>
  );
}

/**
 * A screen that failed to draw (expo-router error boundary): the error, "Réessayer", and a way
 * back, instead of the app closing.
 */
export function RouteError({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [report] = useState(() => reportOf(error, 'screen'));
  useEffect(() => {
    // Saved for Help; not shown twice (this screen already says it).
    recordCrash(report, false);
  }, [report]);
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        gap: space.md,
        padding: space.xl,
        backgroundColor: colors.background,
      }}
    >
      <Text variant="title2" accessibilityRole="header">
        {t('crash.title')}
      </Text>
      <Text variant="callout" color="textMuted">
        {t('crash.screenBody')}
      </Text>
      <Detail report={report} />
      <Button
        title={t('crash.send')}
        icon="share-outline"
        variant="secondary"
        onPress={() => void Share.share({ message: detailOf(report) })}
      />
      <Button title={t('common.retry')} variant="secondary" onPress={() => void retry()} />
      <Button
        title={t('common.close')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </View>
  );
}
