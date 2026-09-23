import { AppSidebar } from '@/components/feature/AppSidebar';
import { getRtlDirection, getRtlRow, isAppRtl } from '@/lib/rtl';
import { useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

const BACKDROP_COLOR = 'rgba(0,0,0,0.28)';
const PANEL_WIDTH_RATIO = 0.82;
const PANEL_MAX_WIDTH = 340;
const OPEN_MS = 280;
const CLOSE_MS = 280;

export default function SidebarScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const mountedRef = useRef(true);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const slideDistance = Math.min(windowWidth * PANEL_WIDTH_RATIO, PANEL_MAX_WIDTH);
  const closedX = isAppRtl() ? slideDistance : -slideDistance;

  const run = useCallback(
    (
      toValue: number,
      duration: number,
      easing: (value: number) => number,
      onEnd?: (finished: boolean) => void,
    ) => {
      animRef.current?.stop();
      const next = Animated.timing(progress, {
        toValue,
        duration,
        easing,
        useNativeDriver: true,
      });
      animRef.current = next;
      next.start(({ finished }) => onEnd?.(finished));
    },
    [progress],
  );

  useLayoutEffect(() => {
    mountedRef.current = true;
    closingRef.current = false;
    run(1, OPEN_MS, Easing.out(Easing.cubic));
    return () => {
      mountedRef.current = false;
      animRef.current?.stop();
    };
  }, [run]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    progress.stopAnimation((value) => {
      const duration = Math.max(1, Math.round(CLOSE_MS * value));
      run(0, duration, Easing.in(Easing.cubic), (finished) => {
        if (!finished) {
          closingRef.current = false;
          return;
        }
        if (mountedRef.current) router.back();
      });
    });
  }, [progress, router, run]);

  useLayoutEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [closedX, 0],
  });

  return (
    <View style={[styles.root, getRtlDirection()]} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      <Animated.View
        pointerEvents="box-none"
        style={[styles.panelLayer, getRtlRow(), { transform: [{ translateX }] }]}
      >
        <AppSidebar onClose={close} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: BACKDROP_COLOR,
  },
  panelLayer: {
    ...StyleSheet.absoluteFillObject,
  },
});
