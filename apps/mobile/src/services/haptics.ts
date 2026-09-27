import * as Haptics from 'expo-haptics';
import { runtime } from './runtime';

/** Haptics are used sparingly (favorite, item checked, success, timer done, errors) and can be disabled. */
function enabled() {
  try {
    return runtime.session?.repos.settings().hapticsEnabled ?? true;
  } catch {
    return true;
  }
}

export const haptic = {
  light: () =>
    enabled() && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
  selection: () => enabled() && void Haptics.selectionAsync().catch(() => undefined),
  success: () =>
    enabled() &&
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  warning: () =>
    enabled() &&
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined),
  error: () =>
    enabled() &&
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined),
};
