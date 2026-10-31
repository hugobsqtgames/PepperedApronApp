import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { runtime } from '../services/runtime';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { IconButton } from './Button';
import { Text } from './Text';

/** Every tip of the app: shown once each, until closed. */
export const TIP_IDS = [
  'home',
  'planning',
  'shopping',
  'search',
  'cook',
  'pantry',
  'recipe',
] as const;
export type TipId = (typeof TIP_IDS)[number];
const key = (id: TipId) => `tip_seen_${id}`;

/**
 * A one-time hint the first time a screen is opened ("Long-press a meal to move it"), closed
 * for good with ✕. Stored on this device only.
 */
export function Tip({ id, icon = 'bulb-outline' }: { id: TipId; icon?: IconName }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    const store = runtime.session?.store;
    if (store)
      void store
        .meta(key(id))
        .then((v) => alive && setShow(v !== '1'))
        .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id]);
  if (!show) return null;
  const close = () => {
    setShow(false);
    void runtime.session?.store.setMeta(key(id), '1').catch(() => undefined);
  };
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingLeft: space.md,
        borderRadius: radius.lg,
        backgroundColor: colors.accentSoft,
      }}
      accessibilityLiveRegion="polite"
      testID={`tip-${id}`}
    >
      <Icon name={icon} size={20} color="accent" />
      <Text variant="callout" style={{ flex: 1, paddingVertical: space.sm }}>
        {t(`tips.${id}`)}
      </Text>
      <IconButton icon="close" size={40} label={t('tips.close')} onPress={close} />
    </View>
  );
}

/** "Show the tips again" (Help screen). */
export async function resetTips() {
  const store = runtime.session?.store;
  if (store) for (const id of TIP_IDS) await store.setMeta(key(id), '0');
}
