import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { iosEaseBezier, spring } from '@/design-system/tokens/motion';
import { useTheme } from '@/hooks/useTheme';
import {
  SHEET_BACKDROP_IN_MS,
  SHEET_CLOSE_MS,
  SHEET_OFFSCREEN,
  shouldDismissSheet,
  shouldStartSheetDrag,
} from '@/lib/sheetMotion';

const iosEase = Easing.bezier(...iosEaseBezier);

export type SheetModalProps = {
  visible: boolean;
  /** Backdrop tap, Android back, or drag-down. The parent sets `visible` to false. */
  onClose: () => void;
  /** Runs once the close animation finished and the sheet unmounted. */
  onClosed?: () => void;
  /** false: no backdrop tap / drag / back dismissal (explicit choice required). */
  dismissible?: boolean;
  /** Wrap in a KeyboardAvoidingView (sheets with inputs). */
  keyboardAvoiding?: boolean;
  backdropColor?: string;
  /** Style of the animated container (e.g. `{ maxHeight: '85%' }`). */
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
};

/**
 * Shared iOS-style bottom sheet: dim fades in while the sheet springs up from the
 * bottom edge; drag the top of the sheet down (or flick) to dismiss. RN Animated only,
 * every animation on the native driver. The sheet's own look stays in `children`.
 */
export function SheetModal({
  visible,
  onClose,
  onClosed,
  dismissible = true,
  keyboardAvoiding = false,
  backdropColor,
  containerStyle,
  testID,
  children,
}: SheetModalProps) {
  const { colors } = useTheme();
  const [mounted, setMounted] = useState(visible);
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setMounted(true);
  }
  const [measured, setMeasured] = useState(false);
  const [values] = useState(() => ({
    offset: new Animated.Value(SHEET_OFFSCREEN),
    drag: new Animated.Value(0),
    backdrop: new Animated.Value(0),
  }));
  const sheetHeight = useRef(0);
  const rootHeight = useRef(0);
  const latest = useRef({ onClose, onClosed, dismissible });
  latest.current = { onClose, onClosed, dismissible };

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      if (!measured) return;
      Animated.parallel([
        Animated.spring(values.offset, { toValue: 0, ...spring.ios, useNativeDriver: true }),
        Animated.spring(values.drag, { toValue: 0, ...spring.ios, useNativeDriver: true }),
        Animated.timing(values.backdrop, {
          toValue: 1,
          duration: SHEET_BACKDROP_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    const to = sheetHeight.current || SHEET_OFFSCREEN;
    Animated.parallel([
      Animated.timing(values.offset, { toValue: to, duration: SHEET_CLOSE_MS, easing: iosEase, useNativeDriver: true }),
      Animated.timing(values.drag, { toValue: 0, duration: SHEET_CLOSE_MS, easing: iosEase, useNativeDriver: true }),
      Animated.timing(values.backdrop, { toValue: 0, duration: SHEET_CLOSE_MS, easing: iosEase, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      values.offset.setValue(SHEET_OFFSCREEN);
      setMeasured(false);
      setMounted(false);
      latest.current.onClosed?.();
    });
  }, [measured, mounted, values, visible]);

  const pan = useMemo(() => {
    const settle = () =>
      Animated.spring(values.drag, { toValue: 0, ...spring.ios, useNativeDriver: true }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        shouldStartSheetDrag({
          dx: g.dx,
          dy: g.dy,
          startY: g.y0,
          sheetTop: rootHeight.current - sheetHeight.current,
          dismissible: latest.current.dismissible,
        }),
      onPanResponderMove: (_e, g) => values.drag.setValue(g.dy),
      onPanResponderRelease: (_e, g) => {
        if (shouldDismissSheet(g.dy, g.vy, sheetHeight.current)) latest.current.onClose();
        else settle();
      },
      onPanResponderTerminate: settle,
    });
  }, [values]);

  // Downward drag follows the finger; upward drag resists (rubber band).
  const translateY = useMemo(
    () =>
      Animated.add(
        values.offset,
        values.drag.interpolate({
          inputRange: [-120, 0, 1],
          outputRange: [-14, 0, 1],
          extrapolateLeft: 'clamp',
        }),
      ),
    [values],
  );

  if (!mounted) return null;

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    sheetHeight.current = h;
    if (!measured && h > 0) {
      values.offset.setValue(h);
      setMeasured(true);
    }
  };

  const close = () => {
    if (latest.current.dismissible) latest.current.onClose();
  };

  const body = (
    <>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: backdropColor ?? colors.bgOverlay, opacity: values.backdrop },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="إغلاق" />
      </Animated.View>
      <Animated.View
        testID={testID}
        accessibilityViewIsModal
        onLayout={onSheetLayout}
        style={[containerStyle, { transform: [{ translateY }] }]}
        {...pan.panHandlers}
      >
        {children}
      </Animated.View>
    </>
  );

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.root}
          behavior="padding"
          onLayout={(e) => {
            rootHeight.current = e.nativeEvent.layout.height;
          }}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        <View
          style={styles.root}
          onLayout={(e) => {
            rootHeight.current = e.nativeEvent.layout.height;
          }}
        >
          {body}
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});

export default SheetModal;
