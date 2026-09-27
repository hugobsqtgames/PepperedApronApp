import { useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { openTextDraft } from '../../../features/recipe/openDraft';
import { track } from '../../../services/analytics';
import { space } from '../../../theme/tokens';
import { Button, IconButton, Screen, Text, TextField } from '../../../ui';

export default function ImportText() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  return (
    <Screen edges={['top', 'bottom']} keyboard maxWidth={640}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: space.md }}>
        <Text variant="title1" style={{ flex: 1 }} accessibilityRole="header">
          {t('import.textTitle')}
        </Text>
        <IconButton icon="close" label={t('common.close')} onPress={() => router.back()} />
      </View>
      <View style={{ gap: space.lg, marginTop: space.xl }}>
        <TextField placeholder={t('import.textPlaceholder')} value={text} onChangeText={setText} multiline style={{ minHeight: 260 }} maxLength={20000} testID="import-text" />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title={t('import.paste')} icon="clipboard-outline" variant="secondary" onPress={async () => setText(await Clipboard.getStringAsync())} style={{ flex: 1 }} />
          <Button
            title={t('import.analyze')}
            disabled={!text.trim()}
            onPress={() => {
              track('import_text');
              openTextDraft(text);
            }}
            style={{ flex: 1 }}
            testID="import-text-submit"
          />
        </View>
      </View>
    </Screen>
  );
}
