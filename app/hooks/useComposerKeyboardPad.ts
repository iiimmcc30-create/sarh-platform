import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Bottom inset for comment/message composers.
 *
 * `useSafeAreaInsets().bottom` can jump to IME height on edge-to-edge Android.
 * KeyboardAvoidingView already lifts the composer, so adopting that inflated
 * inset doubles the gap and can leave it behind after hide.
 *
 * This hook freezes the resting system-bar inset while the keyboard is open
 * and ignores IME-sized increases after hide.
 */
export function useComposerKeyboardPad() {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const restingRef = useRef(insets.bottom);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (!keyboardVisible) {
    const prev = restingRef.current;
    const next = insets.bottom;
    if (next <= prev || next - prev < 80) {
      restingRef.current = next;
    }
  }

  return {
    keyboardVisible,
    restingBottom: restingRef.current,
  };
}
