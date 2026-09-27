import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface SheetOption {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress: () => void;
}

type Show = (opts: { title?: string; message?: string; options: SheetOption[] }) => void;
const Ctx = createContext<Show>(() => undefined);

/** Native action sheet on iOS; a matching bottom sheet elsewhere. */
export function ActionSheetProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<{ title?: string; message?: string; options: SheetOption[] } | null>(null);

  const show: Show = useCallback(
    (opts) => {
      if (Platform.OS === 'ios') {
        const labels = [...opts.options.map((o) => o.label), t('common.cancel')];
        const destructive = opts.options.map((o, i) => (o.destructive ? i : -1)).filter((i) => i >= 0);
        ActionSheetIOS.showActionSheetWithOptions(
          { title: opts.title, message: opts.message, options: labels, cancelButtonIndex: labels.length - 1, destructiveButtonIndex: destructive },
          (i) => {
            if (i < opts.options.length) opts.options[i]!.onPress();
          },
        );
        return;
      }
      setState(opts);
    },
    [t],
  );

  return (
    <Ctx.Provider value={show}>
      {children}
      <Modal visible={!!state} transparent animationType="slide" onRequestClose={() => setState(null)}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={() => setState(null)} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + space.md }]}>
          {state?.title ? (
            <Text variant="title3" align="center" style={{ marginBottom: space.sm }}>
              {state.title}
            </Text>
          ) : null}
          {state?.message ? (
            <Text variant="caption" color="textMuted" align="center" style={{ marginBottom: space.sm }}>
              {state.message}
            </Text>
          ) : null}
          {state?.options.map((o) => (
            <Pressable
              key={o.label}
              accessibilityRole="button"
              onPress={() => {
                setState(null);
                o.onPress();
              }}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surfaceMuted }]}
            >
              {o.icon ? <Icon name={o.icon} size={20} tint={o.destructive ? colors.danger : colors.primary} /> : null}
              <Text variant="body" style={{ color: o.destructive ? colors.danger : colors.text }}>
                {o.label}
              </Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setState(null)} style={({ pressed }) => [styles.option, { justifyContent: 'center' }, pressed && { backgroundColor: colors.surfaceMuted }]}>
            <Text variant="bodyStrong" color="textMuted">
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

export const useActionSheet = () => useContext(Ctx);

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: space.lg, gap: 2 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingHorizontal: space.md, borderRadius: radius.md },
});
