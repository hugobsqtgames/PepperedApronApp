import { useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { ENV, sitePage } from '../../../services/env';
import { space } from '../../../theme/tokens';
import { Button, Card, Text, useToast } from '../../../ui';

const FAQ = [1, 2, 3, 4, 5] as const;

export default function Help() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState<number | null>(null);

  /** No server: messages go through the user's own mail app, with what support needs to help. */
  const write = async () => {
    const body = `\n\n—\nPepperedApron ${ENV.appVersion} · ${Platform.OS} ${Platform.Version}`;
    const url = `mailto:${ENV.supportEmail}?subject=${encodeURIComponent('PepperedApron')}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      toast(t('contact.noMailApp', { email: ENV.supportEmail }), { tone: 'error' });
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: space.lg,
        gap: space.xl,
        maxWidth: 640,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      <View style={{ gap: space.sm }}>
        <Text variant="title2">{t('contact.faq')}</Text>
        {FAQ.map((n) => (
          <Card
            key={n}
            onPress={() => setOpen(open === n ? null : n)}
            accessibilityLabel={t(`contact.q${n}`)}
          >
            <Text variant="bodyStrong">{t(`contact.q${n}`)}</Text>
            {open === n ? (
              <Text color="textMuted" style={{ marginTop: space.sm }}>
                {t(`contact.a${n}`)}
              </Text>
            ) : null}
          </Card>
        ))}
      </View>
      <View style={{ gap: space.md }}>
        <Text variant="title2">{t('contact.title')}</Text>
        <Text color="textMuted">{t('contact.body', { email: ENV.supportEmail })}</Text>
        <Button title={t('contact.write')} icon="mail-outline" onPress={() => void write()} />
        <Button
          title={t('contact.website')}
          variant="secondary"
          icon="globe-outline"
          onPress={() => void WebBrowser.openBrowserAsync(sitePage('support', i18n.language))}
        />
      </View>
    </ScrollView>
  );
}
