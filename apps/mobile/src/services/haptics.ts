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
  /** A short "ta-da": a success, then two light taps (first dish, badge won). */
  celebrate: () => {
    if (!enabled()) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    for (const ms of [180, 320])
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined), ms);
  },
  /** Picking up something to drag (a meal in the week). */
  pickUp: () =>
    enabled() && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined),
  /** Putting it down somewhere new. */
  drop: () =>
    enabled() && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => undefined),
  /** Moving over a new place while dragging, or a step changing. */
  tick: () =>
    enabled() && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => undefined),
  /** A kitchen timer is over: three firm taps, felt through a pocket. */
  timerDone: () => {
    if (!enabled()) return;
    for (const ms of [0, 260, 520])
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined), ms);
  },
  error: () =>
    enabled() &&
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined),
};
