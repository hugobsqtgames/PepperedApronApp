import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRuntime } from '../../../hooks/runtime';
import { errorMessage, isEmail } from '../../../lib/errors';
import { space } from '../../../theme/tokens';
import { Button, Card, Text, TextField, useToast } from '../../../ui';

const FAQ = [1, 2, 3, 4] as const;

export default function Help() {
  const { t } = useTranslation();
  const rt = useRuntime();
  const toast = useToast();
  const [open, setOpen] = useState<number | null>(null);
  const [email, setEmail] = useState(rt.user?.email.endsWith('.invalid') ? '' : (rt.user?.email ?? ''));
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const send = async () => {
    if (email && !isEmail(email)) return toast(t('errors.invalidEmail'), { tone: 'error' });
    try {
      await rt.api.contact({ email: email.trim() || null, subject: subject.trim(), message: message.trim() });
      setSent(true);
      setSubject('');
      setMessage('');
      toast(t('contact.sent'));
    } catch (e) {
      toast(errorMessage(e, t), { tone: 'error' });
    }
  };
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.xl, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
      <View style={{ gap: space.sm }}>
        <Text variant="title2">{t('contact.faq')}</Text>
        {FAQ.map((n) => (
          <Card key={n} onPress={() => setOpen(open === n ? null : n)} accessibilityLabel={t(`contact.q${n}`)}>
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
        <TextField label={t('contact.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextField label={t('contact.subject')} value={subject} onChangeText={setSubject} maxLength={120} />
        <TextField label={t('contact.message')} value={message} onChangeText={setMessage} multiline maxLength={5000} />
        <Button title={t('contact.send')} onPress={send} disabled={!subject.trim() || !message.trim()} />
        {sent ? <Text color="primary">{t('contact.sent')}</Text> : null}
      </View>
    </ScrollView>
  );
}
