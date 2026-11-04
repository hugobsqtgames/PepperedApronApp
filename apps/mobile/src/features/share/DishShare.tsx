import { forwardRef, useRef, useState, type ReactNode } from 'react';
import {
  Linking,
  Modal,
  PixelRatio,
  Pressable,
  ScrollView,
  Share,
  View,
  type HostInstance,
} from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as SMS from 'expo-sms';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useTranslation } from 'react-i18next';
import type { RecipeCategory } from '@pepperedapron/core';
import { useTheme } from '../../theme/ThemeProvider';
import { fonts, space } from '../../theme/tokens';
import { Icon, IconButton, QrCode, RecipePhoto, Text, useToast, type IconName } from '../../ui';

/** The App Store page of the app (any country): in every message, and behind the QR codes. */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6829014530';

/** Fixed colours: the images look the same whatever the theme of whoever sees them. */
const C = {
  cream: '#F7F1E6',
  sand: '#E8DFCF',
  forest: '#1F4D3A',
  forestDeep: '#163A2B',
  ink: '#1F2A24',
  muted: '#5E655F',
  paprika: '#D2642A',
  peach: '#F2A578',
  mint: '#D6E4DA',
};

/** Laid out at a third of the final size: captured at 3x, a story is 1080 × 1920 pixels. */
const STORY = { w: 360, h: 640 };
const POST = { w: 360, h: 450 };
const PREVIEW_H = 400;

export type DishShareTarget =
  'story' | 'post' | 'facebook' | 'sms' | 'whatsapp' | 'messenger' | 'x' | 'more';

interface Dish {
  title: string;
  category: RecipeCategory | null;
  /** The photo of the dish just cooked, else the recipe's photo, else none. */
  photo: string | null;
}

/** The story (9:16): the dish, its name, the app and a QR code to the App Store. */
const StoryImage = forwardRef<HostInstance, { dish: Dish }>(function StoryImage({ dish }, ref) {
  const { t } = useTranslation();
  return (
    <View
      ref={ref}
      collapsable={false}
      style={{ width: STORY.w, height: STORY.h, backgroundColor: C.forest, overflow: 'hidden' }}
    >
      {/* Instagram covers the top ~60 and bottom ~100 points with its own buttons. */}
      <View style={{ position: 'absolute', top: 62, left: 22, right: 22 }}>
        <RecipePhoto
          uri={dish.photo}
          category={dish.category}
          style={{ width: STORY.w - 44, height: 230, borderRadius: 26 }}
        />
        <Text
          style={{ color: C.peach, fontSize: 13, letterSpacing: 2, marginTop: 20 }}
          weight="800"
          maxFontSizeMultiplier={1}
        >
          {t('dishShare.homemade')}
        </Text>
        <Text
          style={{ color: C.cream, fontFamily: fonts.display, fontSize: 30, lineHeight: 35 }}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          maxFontSizeMultiplier={1}
        >
          {dish.title}
        </Text>
        <Text
          style={{ color: C.mint, fontSize: 15, lineHeight: 21, marginTop: 6 }}
          maxFontSizeMultiplier={1}
        >
          {t('dishShare.storyLine')}
        </Text>
      </View>
      <Footer dark bottom={104} />
    </View>
  );
});

/** The post (4:5) for the Instagram and Facebook feeds. */
const PostImage = forwardRef<HostInstance, { dish: Dish }>(function PostImage({ dish }, ref) {
  const { t } = useTranslation();
  return (
    <View
      ref={ref}
      collapsable={false}
      style={{ width: POST.w, height: POST.h, backgroundColor: C.cream, overflow: 'hidden' }}
    >
      <RecipePhoto
        uri={dish.photo}
        category={dish.category}
        style={{ width: POST.w, height: 250 }}
      />
      <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
        <Text
          style={{ color: C.paprika, fontSize: 11, letterSpacing: 2 }}
          weight="800"
          maxFontSizeMultiplier={1}
        >
          {t('dishShare.homemade')}
        </Text>
        <Text
          style={{ color: C.ink, fontFamily: fonts.display, fontSize: 26, lineHeight: 30 }}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          maxFontSizeMultiplier={1}
        >
          {dish.title}
        </Text>
      </View>
      <Footer bottom={16} />
    </View>
  );
});

function Footer({ dark, bottom }: { dark?: boolean; bottom: number }) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        position: 'absolute',
        left: 20,
        right: 20,
        bottom,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        borderRadius: 18,
        backgroundColor: dark ? 'rgba(255,255,255,0.1)' : C.sand,
      }}
    >
      <Image
        source={require('../../../assets/icon.png')}
        style={{ width: 40, height: 40, borderRadius: 10 }}
        accessibilityIgnoresInvertColors
      />
      <View style={{ flex: 1 }}>
        <Text
          weight="800"
          style={{ color: dark ? C.cream : C.forest, fontSize: 15 }}
          maxFontSizeMultiplier={1}
        >
          PepperedApron
        </Text>
        <Text
          style={{ color: dark ? C.mint : C.muted, fontSize: 12, lineHeight: 16 }}
          maxFontSizeMultiplier={1}
        >
          {t('dishShare.footer')}
        </Text>
      </View>
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 8, padding: 3 }}>
        <QrCode value={APP_STORE_URL} size={dark ? 58 : 50} />
      </View>
    </View>
  );
}

/** A full-size image shown smaller on screen (the capture keeps the full size). */
function Scaled({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  const s = PREVIEW_H / h;
  return (
    <View
      style={{ width: w * s, height: PREVIEW_H, borderRadius: 18, overflow: 'hidden' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          position: 'absolute',
          width: w,
          height: h,
          transformOrigin: 'top left',
          transform: [{ scale: s }],
        }}
      >
        {children}
      </View>
    </View>
  );
}

const TARGETS: { key: DishShareTarget; icon: IconName; color: string }[] = [
  { key: 'story', icon: 'logo-instagram', color: '#C13584' },
  { key: 'post', icon: 'logo-instagram', color: '#833AB4' },
  { key: 'facebook', icon: 'logo-facebook', color: '#1877F2' },
  { key: 'sms', icon: 'chatbubble', color: '#34C759' },
  { key: 'whatsapp', icon: 'logo-whatsapp', color: '#25D366' },
  { key: 'messenger', icon: 'chatbubble-ellipses', color: '#0084FF' },
  { key: 'x', icon: 'logo-x', color: '#000000' },
  { key: 'more', icon: 'ellipsis-horizontal', color: C.muted },
];

/**
 * "Share my dish", at the end of cooking: one button per app, each with what suits it. A story
 * image for Instagram stories, a post image and its caption (copied, ready to paste) for the
 * Instagram and Facebook feeds, a message with the photo for SMS, a text with the App Store link
 * for WhatsApp, X and the others. Everything is made on the phone.
 */
export function DishShareModal({
  visible,
  dish,
  onClose,
}: {
  visible: boolean;
  dish: Dish;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, a11y } = useTheme();
  const toast = useToast();
  const story = useRef<HostInstance>(null);
  const post = useRef<HostInstance>(null);
  const [busy, setBusy] = useState<DishShareTarget | null>(null);

  const message = t('dishShare.message', { title: dish.title, url: APP_STORE_URL });
  // The size is in points, multiplied by the screen scale: 1080 pixels wide on every iPhone. A
  // JPEG, not a PNG: a 3x PNG of a photo weighed 27 MB, too much for Facebook (closed at once)
  // and for a text message (never opened).
  const capture = async (which: 'story' | 'post', result: 'tmpfile' | 'base64' = 'tmpfile') => {
    const size = which === 'story' ? STORY : POST;
    const scale = (size.w * 3) / PixelRatio.get() / size.w;
    return captureRef(which === 'story' ? story : post, {
      format: 'jpg',
      quality: 0.9,
      result,
      width: size.w * scale,
      height: size.h * scale,
    });
  };
  const shareImage = (uri: string) =>
    Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg' });

  /**
   * Straight into Instagram's editor with the image (no share sheet, no "Reel, post or story?"
   * page): the image is saved to the photos, then Instagram opens on it. False when Instagram is
   * not installed or the photos cannot be written.
   */
  const openInInstagram = async (uri: string) => {
    if (!(await Linking.canOpenURL('instagram://app').catch(() => false))) return false;
    const perm = await MediaLibrary.requestPermissionsAsync(false).catch(() => null);
    if (!perm?.granted) return false;
    const asset = await MediaLibrary.createAssetAsync(uri).catch(() => null);
    if (!asset) return false;
    await Linking.openURL(`instagram://library?LocalIdentifier=${encodeURIComponent(asset.id)}`);
    return true;
  };

  const run = async (target: DishShareTarget) => {
    setBusy(target);
    try {
      switch (target) {
        case 'story':
        case 'post': {
          const uri = await capture(target);
          // Instagram takes no text with an image: the link (for the Link sticker of a story) or
          // the caption (for a post) is copied, to paste.
          await Clipboard.setStringAsync(
            target === 'story'
              ? APP_STORE_URL
              : t('dishShare.instagramCaption', { title: dish.title, url: APP_STORE_URL }),
          );
          toast(t(target === 'story' ? 'dishShare.storyHint' : 'dishShare.postHint'));
          if (!(await openInInstagram(uri))) await shareImage(uri);
          break;
        }
        case 'facebook': {
          const uri = await capture('post');
          // Facebook drops any text sent with an image: the text is copied, to paste.
          await Clipboard.setStringAsync(
            t('dishShare.facebookCaption', { title: dish.title, url: APP_STORE_URL }),
          );
          toast(t('dishShare.facebookHint'));
          await shareImage(uri);
          break;
        }
        case 'sms': {
          if (await SMS.isAvailableAsync()) {
            const uri = await capture('post');
            await SMS.sendSMSAsync([], message, {
              attachments: { uri, mimeType: 'image/jpeg', filename: 'PepperedApron.jpg' },
            });
          } else await Linking.openURL(`sms:&body=${encodeURIComponent(message)}`);
          break;
        }
        case 'whatsapp': {
          const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
          if (await Linking.canOpenURL(url)) await Linking.openURL(url);
          else await Share.share({ message });
          break;
        }
        case 'x': {
          // X takes text from a link, never an image: the photo is copied, to paste in the post.
          const b64 = await capture('post', 'base64');
          await Clipboard.setImageAsync(b64.replace(/^data:image\/\w+;base64,/, ''));
          toast(t('dishShare.xHint'));
          await Linking.openURL(
            `https://x.com/intent/post?text=${encodeURIComponent(
              t('dishShare.xText', { title: dish.title, url: APP_STORE_URL }),
            )}`,
          );
          break;
        }
        case 'messenger':
        case 'more': {
          // Messenger has no way to receive a photo and a text from another app: the share
          // sheet does both, Messenger is in it.
          const uri = await capture('post');
          if (target === 'messenger') toast(t('dishShare.messengerHint'));
          await Share.share({ message, url: uri });
          break;
        }
      }
    } catch {
      toast(t('share.failed'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType={a11y.reduceMotion ? 'fade' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }} testID="dish-share">
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.lg }}>
          <Text variant="title2" style={{ flex: 1 }} accessibilityRole="header">
            {t('dishShare.title')}
          </Text>
          <IconButton icon="close" label={t('common.close')} onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ gap: space.lg, paddingBottom: space.huge }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.md, paddingHorizontal: space.lg }}
          >
            <Scaled w={STORY.w} h={STORY.h}>
              <StoryImage ref={story} dish={dish} />
            </Scaled>
            <Scaled w={POST.w} h={POST.h}>
              <PostImage ref={post} dish={dish} />
            </Scaled>
          </ScrollView>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              paddingHorizontal: space.md,
              rowGap: space.lg,
            }}
          >
            {TARGETS.map((x) => (
              <Pressable
                key={x.key}
                onPress={() => void run(x.key)}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel={t(`dishShare.to.${x.key}`)}
                style={({ pressed }) => ({
                  width: '25%',
                  alignItems: 'center',
                  gap: 6,
                  opacity: pressed || busy === x.key ? 0.5 : 1,
                })}
                testID={`dish-share-${x.key}`}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 18,
                    backgroundColor: x.color,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={x.icon} size={28} tint="#FFFFFF" />
                </View>
                <Text variant="caption" align="center" numberOfLines={2}>
                  {t(`dishShare.to.${x.key}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text
            variant="caption"
            color="textMuted"
            align="center"
            style={{ paddingHorizontal: space.xl }}
          >
            {t('dishShare.note')}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}
