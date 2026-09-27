import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { adsEnabled, adsState, bannerUnitId, subscribeAds, type AdsState } from '../services/ads';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Text } from '../ui';

type AdsModule = typeof import('react-native-google-mobile-ads');

/**
 * A clearly labelled inline banner placed between content sections. Renders nothing when ads are
 * disabled remotely, consent was refused or the ad fails to load (no empty frames).
 */
export function AdSlot({ placement }: { placement: 'home' | 'search' }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [s, setS] = useState<AdsState>(adsState());
  const [mod, setMod] = useState<AdsModule | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const off = subscribeAds(setS);
    return () => void off();
  }, []);
  useEffect(() => {
    if (!s.ready) return;
    let alive = true;
    import('react-native-google-mobile-ads')
      .then((m) => alive && setMod(m))
      .catch(() => setFailed(true));
    return () => {
      alive = false;
    };
  }, [s.ready]);
  if (!adsEnabled() || !s.ready || !mod || failed) return null;
  const unit = bannerUnitId(mod.TestIds.ADAPTIVE_BANNER);
  if (!unit) return null;
  const { BannerAd, BannerAdSize } = mod;
  return (
    <View
      style={{
        gap: space.xs,
        alignItems: 'center',
        paddingVertical: space.sm,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
      }}
      accessibilityLabel={t('ads.label')}
    >
      <Text variant="micro" color="textSubtle" style={{ textTransform: 'uppercase' }}>
        {t('ads.label')}
      </Text>
      <BannerAd
        unitId={unit}
        size={BannerAdSize.INLINE_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: !s.personalized,
          keywords: placement === 'search' ? ['recipes', 'cooking'] : ['food', 'cooking'],
        }}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
