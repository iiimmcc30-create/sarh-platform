import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { clampPan, clampViewerScale, isZoomed } from '@/lib/mediaViewerGestures';

const TIMING = { duration: 180 };
const DOUBLE_TAP_SCALE = 2;

type ZoomListener = (zoomed: boolean) => void;

function frameOf(width: SharedValue<number>, height: SharedValue<number>) {
  'worklet';
  return { width: width.value, height: height.value };
}

/**
 * Feed-video gestures only. Double tap wins over single tap.
 * Pan activates only while zoomed so the feed can still scroll at 1x.
 */
export function useFeedVideoGestures(options: {
  enabled: boolean;
  /** Gallery page visible and the screen focused. */
  active: boolean;
  /** Source identity. Zoom resets when this changes. */
  resetKey: string;
  onToggleChrome: () => void;
  onZoomedChange?: ZoomListener;
}) {
  const { enabled, active, resetKey, onToggleChrome, onZoomedChange } = options;

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const pinchStart = useSharedValue(1);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const zoomed = useSharedValue(false);
  const width = useSharedValue(0);
  const height = useSharedValue(0);

  const onZoomedChangeRef = useRef(onZoomedChange);
  onZoomedChangeRef.current = onZoomedChange;
  const onToggleRef = useRef(onToggleChrome);
  onToggleRef.current = onToggleChrome;

  const publishZoomed = useCallback((next: boolean) => {
    onZoomedChangeRef.current?.(next);
  }, []);

  const toggleChrome = useCallback(() => {
    onToggleRef.current();
  }, []);

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1, TIMING);
    translateX.value = withTiming(0, TIMING);
    translateY.value = withTiming(0, TIMING);
    zoomed.value = false;
    publishZoomed(false);
  }, [publishZoomed, scale, translateX, translateY, zoomed]);

  const resetImmediate = useCallback(() => {
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    zoomed.value = false;
    publishZoomed(false);
  }, [publishZoomed, scale, translateX, translateY, zoomed]);

  useEffect(() => {
    if (!active) resetImmediate();
  }, [active, resetImmediate]);

  const resetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    resetImmediate();
  }, [resetImmediate, resetKey]);

  const onLayout = useCallback(
    (nextWidth: number, nextHeight: number) => {
      width.value = nextWidth;
      height.value = nextHeight;
    },
    [height, width],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(enabled && active)
        .onBegin(() => {
          pinchStart.value = scale.value;
        })
        .onUpdate((e) => {
          const next = clampViewerScale(pinchStart.value * e.scale);
          const frame = frameOf(width, height);
          const clamped = clampPan(translateX.value, translateY.value, next, frame, frame);
          scale.value = next;
          translateX.value = clamped.x;
          translateY.value = clamped.y;
          zoomed.value = isZoomed(next);
        })
        .onEnd(() => {
          if (!isZoomed(scale.value)) {
            scale.value = withTiming(1, TIMING);
            translateX.value = withTiming(0, TIMING);
            translateY.value = withTiming(0, TIMING);
            zoomed.value = false;
            runOnJS(publishZoomed)(false);
            return;
          }
          const frame = frameOf(width, height);
          const clamped = clampPan(translateX.value, translateY.value, scale.value, frame, frame);
          translateX.value = withTiming(clamped.x, TIMING);
          translateY.value = withTiming(clamped.y, TIMING);
          zoomed.value = true;
          runOnJS(publishZoomed)(true);
        }),
    [active, enabled, height, pinchStart, publishZoomed, scale, translateX, translateY, width, zoomed],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled && active)
        .manualActivation(true)
        .minPointers(1)
        .maxPointers(1)
        .onTouchesDown((_e, state) => {
          if (!zoomed.value) state.fail();
        })
        .onTouchesMove((e, state) => {
          if (zoomed.value && e.numberOfTouches === 1) state.activate();
          else state.fail();
        })
        .onBegin(() => {
          panStartX.value = translateX.value;
          panStartY.value = translateY.value;
        })
        .onUpdate((e) => {
          if (!zoomed.value) return;
          const frame = frameOf(width, height);
          const clamped = clampPan(
            panStartX.value + e.translationX,
            panStartY.value + e.translationY,
            scale.value,
            frame,
            frame,
          );
          translateX.value = clamped.x;
          translateY.value = clamped.y;
        }),
    [active, enabled, height, panStartX, panStartY, scale, translateX, translateY, width, zoomed],
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(enabled && active)
        .numberOfTaps(2)
        .maxDuration(250)
        .maxDelay(280)
        .maxDistance(18)
        .onEnd(() => {
          if (isZoomed(scale.value)) {
            scale.value = withTiming(1, TIMING);
            translateX.value = withTiming(0, TIMING);
            translateY.value = withTiming(0, TIMING);
            zoomed.value = false;
            runOnJS(publishZoomed)(false);
            return;
          }
          const next = clampViewerScale(DOUBLE_TAP_SCALE);
          scale.value = withTiming(next, TIMING);
          translateX.value = withTiming(0, TIMING);
          translateY.value = withTiming(0, TIMING);
          zoomed.value = true;
          runOnJS(publishZoomed)(true);
        }),
    [active, enabled, publishZoomed, scale, translateX, translateY, zoomed],
  );

  const singleTap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(enabled && active)
        .numberOfTaps(1)
        .maxDuration(250)
        .maxDistance(18)
        .onEnd(() => {
          runOnJS(toggleChrome)();
        }),
    [active, enabled, toggleChrome],
  );

  const gesture = useMemo(() => {
    const taps = Gesture.Exclusive(doubleTap, singleTap);
    return Gesture.Simultaneous(pinch, pan, taps);
  }, [doubleTap, pan, pinch, singleTap]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return { gesture, animatedStyle, onLayout, resetZoom };
}
