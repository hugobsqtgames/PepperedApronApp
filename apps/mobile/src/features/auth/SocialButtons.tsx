import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import { useTranslation } from 'react-i18next';
import { ENV } from '../../services/env';
import { runtime } from '../../services/runtime';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';
import { Button, Text } from '../../ui';

WebBrowser.maybeCompleteAuthSession();

/**
 * Social sign-in. A provider button only appears when it is configured for this build, so there
 * is never a button that does nothing.
 */
export function SocialButtons({ onError }: { onError: (e: unknown) => void }) {
  const { t, i18n } = useTranslation();
  const { dark } = useTheme();
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'ios') void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const apple = async () => {
    try {
      const raw = Crypto.randomUUID();
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashed,
      });
      if (!cred.identityToken) return;
      const name =
        [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') ||
        undefined;
      const res = await runtime.api.oauth('apple', {
        idToken: cred.identityToken,
        nonce: raw,
        name,
        locale: i18n.language,
        device: runtime.device(),
      });
      await runtime.completeAuth(res);
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
      onError(e);
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            dark
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={16}
          style={{ height: 50 }}
          onPress={apple}
        />
      ) : null}
      {ENV.googleClientIds.ios || ENV.googleClientIds.android || ENV.googleClientIds.web ? (
        <GoogleButton onError={onError} />
      ) : null}
      {ENV.facebookAppId ? <FacebookButton onError={onError} /> : null}
      {!appleAvailable &&
      !ENV.googleClientIds.ios &&
      !ENV.googleClientIds.android &&
      !ENV.facebookAppId ? null : (
        <Text variant="caption" color="textSubtle" align="center">
          {t('auth.or')}
        </Text>
      )}
    </View>
  );
}

function GoogleButton({ onError }: { onError: (e: unknown) => void }) {
  const { t, i18n } = useTranslation();
  const [request, response, prompt] = Google.useIdTokenAuthRequest({
    iosClientId: ENV.googleClientIds.ios,
    androidClientId: ENV.googleClientIds.android,
    webClientId: ENV.googleClientIds.web,
  });
  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken) return;
    runtime.api
      .oauth('google', { idToken, locale: i18n.language, device: runtime.device() })
      .then((r) => runtime.completeAuth(r))
      .catch(onError);
  }, [response, i18n.language, onError]);
  return (
    <Button
      title={t('auth.google')}
      variant="secondary"
      icon="logo-google"
      disabled={!request}
      onPress={() => void prompt()}
    />
  );
}

function FacebookButton({ onError }: { onError: (e: unknown) => void }) {
  const { t, i18n } = useTranslation();
  const [request, response, prompt] = Facebook.useAuthRequest({ clientId: ENV.facebookAppId! });
  useEffect(() => {
    if (response?.type !== 'success') return;
    const accessToken = response.authentication?.accessToken ?? response.params.access_token;
    if (!accessToken) return;
    runtime.api
      .oauth('facebook', { accessToken, locale: i18n.language, device: runtime.device() })
      .then((r) => runtime.completeAuth(r))
      .catch(onError);
  }, [response, i18n.language, onError]);
  return (
    <Button
      title={t('auth.facebook')}
      variant="secondary"
      icon="logo-facebook"
      disabled={!request}
      onPress={() => void prompt()}
    />
  );
}
