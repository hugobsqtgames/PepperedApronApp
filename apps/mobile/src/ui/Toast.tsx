import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

interface ToastMsg {
  id: number;
  text: string;
  tone: 'success' | 'error' | 'info';
  action?: { label: string; onPress: () => void };
}

const Ctx = createContext<
  (text: string, opts?: { tone?: ToastMsg['tone']; action?: ToastMsg['action'] }) => void
>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors, dark } = useTheme();

  const show = useCallback(
    (text: string, opts: { tone?: ToastMsg['tone']; action?: ToastMsg['action'] } = {}) => {
      if (timer.current) clearTimeout(timer.current);
      setMsg({ id: Date.now(), text, tone: opts.tone ?? 'success', action: opts.action });
      AccessibilityInfo.announceForAccessibility(text);
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 4,
      }).start();
      timer.current = setTimeout(
        () => {
          Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() =>
            setMsg(null),
          );
        },
        opts.action ? 5000 : 2600,
      );
    },
    [anim],
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const icon: IconName =
    msg?.tone === 'error'
      ? 'alert-circle'
      : msg?.tone === 'info'
        ? 'information-circle'
        : 'checkmark-circle';
  return (
    <Ctx.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrap,
            {
              bottom: insets.bottom + 90,
              opacity: anim,
              transform: [
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
              ],
            },
          ]}
        >
          <View
            style={[styles.toast, { backgroundColor: colors.text }]}
            accessibilityLiveRegion="polite"
          >
            <Icon
              name={icon}
              size={20}
              tint={msg.tone === 'error' ? colors.accent : colors.background}
            />
            <Text variant="callout" style={{ color: colors.background, flex: 1 }}>
              {msg.text}
            </Text>
            {msg.action ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  msg.action!.onPress();
                  setMsg(null);
                }}
                hitSlop={10}
              >
                <Text
                  variant="callout"
                  weight="700"
                  style={{ color: dark ? '#A84A1A' : '#E8894F' }}
                >
                  {msg.action.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    maxWidth: 520,
    width: '100%',
  },
});
