import type { AccessibilityActionEvent } from 'react-native';

/**
 * A long press is hard to find with VoiceOver, Voice Control or Switch Control: the same thing is
 * offered as a named action (VoiceOver: swipe up or down, "Actions" rotor).
 */
export function longPressActions(label: string, onLongPress?: (() => void) | null) {
  if (!onLongPress) return {};
  return {
    accessibilityActions: [{ name: 'longpress', label }],
    onAccessibilityAction: (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'longpress') onLongPress();
    },
  };
}
