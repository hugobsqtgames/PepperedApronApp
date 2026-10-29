import { useRef, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRepos } from '../hooks/runtime';
import { ONBOARDING_PHOTOS } from '../lib/categories';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Button, Text, TextField } from '../ui';

const SLIDES = [
  { key: 's1', photo: ONBOARDING_PHOTOS.recipes },
  { key: 's2', photo: ONBOARDING_PHOTOS.planning },
  { key: 's3', photo: ONBOARDING_PHOTOS.shopping },
  { key: 's4', photo: ONBOARDING_PHOTOS.import },
] as const;

/** Four short slides — recipes, planning, shopping, import — then the first name, then the app. */
export default function Welcome() {
  const { t } = useTranslation();
  const repos = useRepos();
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList>(null);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }).current;
  const last = index === SLIDES.length - 1;
  const [askName, setAskName] = useState(false);
  const [name, setName] = useState('');
  const start = (firstName: string | null) =>
    repos.updateSettings({ firstName, onboardingDone: true });
  const photoH = Math.min(height * 0.5, 520);

  if (askName) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.nameWrap}
        >
          <View style={{ gap: space.lg, width: '100%', maxWidth: 480 }}>
            <Text style={{ fontSize: 48, lineHeight: 58 }} maxFontSizeMultiplier={1}>
              👋
            </Text>
            <Text variant="hero" accessibilityRole="header">
              {t('onboarding.nameTitle')}
            </Text>
            <Text variant="body" color="textMuted">
              {t('onboarding.nameBody')}
            </Text>
            <TextField
              value={name}
              onChangeText={setName}
              placeholder={t('onboarding.namePlaceholder')}
              accessibilityLabel={t('onboarding.nameTitle')}
              autoFocus
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              returnKeyType="done"
              maxLength={40}
              onSubmitEditing={() => name.trim() && void start(name)}
              testID="onboarding-name"
            />
            <Button
              title={t('onboarding.start')}
              size="lg"
              disabled={!name.trim()}
              onPress={() => start(name)}
              testID="onboarding-name-submit"
            />
            <Button
              title={t('common.skip')}
              variant="ghost"
              onPress={() => start(null)}
              testID="onboarding-name-skip"
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <FlatList
        ref={list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.key}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }: { item: (typeof SLIDES)[number] }) => (
          <View style={{ width }}>
            <Image
              source={item.photo}
              style={{
                width,
                height: photoH,
                borderBottomLeftRadius: radius.xxl,
                borderBottomRightRadius: radius.xxl,
              }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            <View
              style={{
                padding: space.xxl,
                gap: space.md,
                maxWidth: 560,
                alignSelf: 'center',
                width: '100%',
              }}
            >
              <Text variant="hero" accessibilityRole="header">
                {t(`onboarding.${item.key}Title`)}
              </Text>
              <Text variant="body" color="textMuted">
                {t(`onboarding.${item.key}Body`)}
              </Text>
            </View>
          </View>
        )}
      />
      <View style={styles.footer}>
        <View
          style={styles.dots}
          accessibilityRole="adjustable"
          accessibilityValue={{ now: index + 1, min: 1, max: SLIDES.length }}
        >
          {SLIDES.map((s, i) => (
            <View
              key={s.key}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? colors.primary : colors.line,
                  width: i === index ? 22 : 8,
                },
              ]}
            />
          ))}
        </View>
        {last ? (
          <View style={{ gap: space.sm, width: '100%', maxWidth: 480 }}>
            <Button
              title={t('common.continue')}
              size="lg"
              onPress={() => setAskName(true)}
              testID="onboarding-start"
            />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: space.sm, width: '100%', maxWidth: 480 }}>
            <Button
              title={t('common.skip')}
              variant="ghost"
              onPress={() => list.current?.scrollToIndex({ index: SLIDES.length - 1 })}
              style={{ flex: 1 }}
              testID="onboarding-skip"
            />
            <Button
              title={t('common.next')}
              onPress={() => list.current?.scrollToIndex({ index: index + 1 })}
              style={{ flex: 2 }}
              testID="onboarding-next"
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.xxl,
    paddingBottom: space.lg,
  },
  dots: { flexDirection: 'row', gap: 6 },
  nameWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.xxl },
  dot: { height: 8, borderRadius: 4 },
});
