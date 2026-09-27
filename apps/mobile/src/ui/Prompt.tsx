import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Button } from './Button';
import { Text } from './Text';
import { TextField } from './TextField';

interface PromptOpts {
  title: string;
  message?: string;
  initial?: string;
  placeholder?: string;
  multiline?: boolean;
  confirm?: string;
  maxLength?: number;
  onSubmit: (value: string) => void;
}
const Ctx = createContext<(o: PromptOpts) => void>(() => undefined);

/** Cross-platform text prompt (iOS Alert.prompt has no Android equivalent). */
export function PromptProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [opts, setOpts] = useState<PromptOpts | null>(null);
  const [value, setValue] = useState('');
  const show = useCallback((o: PromptOpts) => {
    setValue(o.initial ?? '');
    setOpts(o);
  }, []);
  const submit = () => {
    const v = value.trim();
    if (!opts || !v) return;
    const cb = opts.onSubmit;
    setOpts(null);
    cb(v);
  };
  return (
    <Ctx.Provider value={show}>
      {children}
      <Modal visible={!!opts} transparent animationType="fade" onRequestClose={() => setOpts(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpts(null)} accessibilityLabel={t('common.close')} />
          <View style={[styles.card, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
            <Text variant="title3" accessibilityRole="header">
              {opts?.title}
            </Text>
            {opts?.message ? (
              <Text variant="callout" color="textMuted">
                {opts.message}
              </Text>
            ) : null}
            <TextField value={value} onChangeText={setValue} placeholder={opts?.placeholder} autoFocus multiline={opts?.multiline} maxLength={opts?.maxLength ?? 200} onSubmitEditing={opts?.multiline ? undefined : submit} returnKeyType="done" testID="prompt-input" />
            <View style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' }}>
              <Button title={t('common.cancel')} variant="ghost" onPress={() => setOpts(null)} />
              <Button title={opts?.confirm ?? t('common.ok')} onPress={submit} disabled={!value.trim()} testID="prompt-confirm" />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Ctx.Provider>
  );
}

export const usePrompt = () => useContext(Ctx);

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: space.xl },
  card: { borderRadius: radius.xxl, padding: space.xl, gap: space.md, maxWidth: 460, width: '100%', alignSelf: 'center' },
});
