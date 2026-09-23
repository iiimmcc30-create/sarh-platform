import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useComposerKeyboardPad } from '@/hooks/useComposerKeyboardPad';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra offset when a header sits above the avoiding view. */
  offset?: number;
};

/**
 * One keyboard offset for composer screens.
 * Android disables avoidance after hide so KAV padding cannot stick.
 * iOS keeps padding avoidance, which restores cleanly.
 */
export function ComposerKeyboardView({ children, style, offset = 0 }: Props) {
  const { keyboardVisible } = useComposerKeyboardPad();

  return (
    <KeyboardAvoidingView
      style={[styles.fill, style]}
      behavior="padding"
      keyboardVerticalOffset={offset}
      enabled={Platform.OS === 'ios' || keyboardVisible}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
