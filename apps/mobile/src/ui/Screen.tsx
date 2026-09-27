import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useLayout } from '../lib/layout';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

/**
 * Standard screen: safe areas, themed background, optional scroll + pull-to-refresh, keyboard
 * avoidance, and a readable centred column on iPad.
 */
export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  padded = true,
  maxWidth,
  refreshing,
  onRefresh,
  contentStyle,
  keyboard = false,
  testID,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  padded?: boolean;
  maxWidth?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  keyboard?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const layout = useLayout();
  const width = maxWidth ?? layout.contentMaxWidth;
  const inner: StyleProp<ViewStyle> = [{ width: '100%', maxWidth: width, alignSelf: 'center', paddingHorizontal: padded ? layout.gutter : 0 }, contentStyle];
  const body = scroll ? (
    <ScrollView
      testID={testID}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentContainerStyle={{ paddingBottom: space.huge * 2 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    >
      <View style={inner}>{children}</View>
    </ScrollView>
  ) : (
    <View testID={testID} style={[{ flex: 1 }, inner]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      {keyboard ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}
