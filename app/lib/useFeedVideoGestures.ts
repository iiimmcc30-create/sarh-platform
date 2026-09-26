import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import {
  clampPan,
  FEED_DOUBLE_TAP_MS,
  focalZoomOffset,
  isDoubleTap,
  isTapGesture,
  isZoomed,
  nextDoubleTapScale,
  pinchScale,
  shouldCaptureFeedGesture,
  touchDistance,
  VIEWER_MIN_SCALE,
} from '@/lib/mediaViewerGestures';

const SETTLE_MS = 180;

type ZoomListener = (zoomed: boolean) => void;

type TouchList = GestureResponderEvent['nativeEvent']['touches'];

function touchCount(e: GestureResponderEvent): number {
  return e.nativeEvent.touches?.length ?? 0;
}

/**
 * Feed-video gestures (RN PanResponder + RN Animated, no Reanimated / RNGH).
 *
 * Spread `panHandlers` and `touchHandlers` on the View that hosts the rendered
 * media surface. Pinch and zoomed pan claim the JS responder in the capture phase,
 * refuse termination and block the native responder, so the parent FlatList /
 * horizontal ScrollView cannot steal the pinch. A single finger at 1x never claims
 * the responder, so the feed still scrolls. Taps are read from raw touch events,
 * which fire whether or not this view is the responder: double tap toggles 2x zoom,
 * a lone single tap (after the double-tap window) toggles the post chrome.
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

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const live = useRef({ scale: 1, x: 0, y: 0, zoomed: false, width: 0, height: 0 });
  const gesture = useRef({
    pinching: false,
    pinchStartScale: 1,
    pinchStartDistance: 0,
    panStartX: 0,
    panStartY: 0,
    panOriginDx: 0,
    panOriginDy: 0,
  });
  const tap = useRef({
    startX: 0,
    startY: 0,
    startAt: 0,
    moved: false,
    multi: false,
    tracking: false,
  });
  const lastTapRef = useRef<{ at: number; x: number; y: number } | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabledRef = useRef(enabled && active);
  enabledRef.current = enabled && active;
  const onZoomedChangeRef = useRef(onZoomedChange);
  onZoomedChangeRef.current = onZoomedChange;
  const onToggleRef = useRef(onToggleChrome);
  onToggleRef.current = onToggleChrome;

  const publishZoomed = useCallback((nextScale: number) => {
    const next = isZoomed(nextScale);
    if (live.current.zoomed === next) return;
    live.current.zoomed = next;
    onZoomedChangeRef.current?.(next);
  }, []);

  const clearSingleTap = useCallback(() => {
    if (singleTapTimer.current) {
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
    }
  }, []);

  const applyTransform = useCallback(
    (nextScale: number, x: number, y: number, animated: boolean) => {
      live.current.scale = nextScale;
      live.current.x = x;
      live.current.y = y;
      scale.stopAnimation();
      translateX.stopAnimation();
      translateY.stopAnimation();
      if (animated) {
        Animated.parallel([
          Animated.timing(scale, { toValue: nextScale, duration: SETTLE_MS, useNativeDriver: true }),
          Animated.timing(translateX, { toValue: x, duration: SETTLE_MS, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: y, duration: SETTLE_MS, useNativeDriver: true }),
        ]).start();
      } else {
        scale.setValue(nextScale);
        translateX.setValue(x);
        translateY.setValue(y);
      }
      publishZoomed(nextScale);
    },
    [publishZoomed, scale, translateX, translateY],
  );

  const clampToFrame = useCallback((nextScale: number, x: number, y: number) => {
    const frame = { width: live.current.width, height: live.current.height };
    return clampPan(x, y, nextScale, frame, frame);
  }, []);

  const resetZoom = useCallback(() => {
    gesture.current.pinching = false;
    applyTransform(VIEWER_MIN_SCALE, 0, 0, true);
  }, [applyTransform]);

  const settle = useCallback(() => {
    gesture.current.pinching = false;
    const current = live.current;
    if (!isZoomed(current.scale)) {
      applyTransform(VIEWER_MIN_SCALE, 0, 0, true);
      return;
    }
    const clamped = clampToFrame(current.scale, current.x, current.y);
    applyTransform(current.scale, clamped.x, clamped.y, true);
  }, [applyTransform, clampToFrame]);

  const beginPinch = useCallback((touches: TouchList) => {
    const g = gesture.current;
    g.pinching = true;
    g.pinchStartScale = live.current.scale;
    g.pinchStartDistance = touchDistance(touches[0], touches[1]);
  }, []);

  const beginPan = useCallback((state: PanResponderGestureState) => {
    const g = gesture.current;
    g.panStartX = live.current.x;
    g.panStartY = live.current.y;
    g.panOriginDx = state.dx;
    g.panOriginDy = state.dy;
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: (e) =>
          enabledRef.current && shouldCaptureFeedGesture(touchCount(e), live.current.scale),
        onMoveShouldSetPanResponderCapture: (e) =>
          enabledRef.current && shouldCaptureFeedGesture(touchCount(e), live.current.scale),
        // Once pinching / zoomed-panning, the parent list may not take over.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e, state) => {
          clearSingleTap();
          scale.stopAnimation();
          translateX.stopAnimation();
          translateY.stopAnimation();
          const touches = e.nativeEvent.touches;
          if (touches.length >= 2) beginPinch(touches);
          else {
            gesture.current.pinching = false;
            beginPan(state);
          }
        },
        onPanResponderMove: (e, state) => {
          if (!enabledRef.current) return;
          const touches = e.nativeEvent.touches;
          const g = gesture.current;
          if (touches.length >= 2) {
            if (!g.pinching) beginPinch(touches);
            const nextScale = pinchScale(
              g.pinchStartScale,
              touchDistance(touches[0], touches[1]),
              g.pinchStartDistance,
            );
            const clamped = clampToFrame(nextScale, live.current.x, live.current.y);
            applyTransform(nextScale, clamped.x, clamped.y, false);
            return;
          }
          if (g.pinching) {
            // One finger lifted mid-pinch: continue as a pan from here.
            g.pinching = false;
            beginPan(state);
          }
          if (!isZoomed(live.current.scale)) return;
          const clamped = clampToFrame(
            live.current.scale,
            g.panStartX + (state.dx - g.panOriginDx),
            g.panStartY + (state.dy - g.panOriginDy),
          );
          applyTransform(live.current.scale, clamped.x, clamped.y, false);
        },
        onPanResponderRelease: () => settle(),
        onPanResponderTerminate: () => settle(),
      }),
    [applyTransform, beginPan, beginPinch, clampToFrame, clearSingleTap, scale, settle, translateX, translateY],
  );

  const onTouchStart = useCallback(
    (e: GestureResponderEvent) => {
      const t = tap.current;
      if (!enabledRef.current) {
        t.tracking = false;
        return;
      }
      if (touchCount(e) > 1) {
        t.multi = true;
        clearSingleTap();
        return;
      }
      t.tracking = true;
      t.multi = false;
      t.moved = false;
      t.startX = e.nativeEvent.pageX;
      t.startY = e.nativeEvent.pageY;
      t.startAt = Date.now();
    },
    [clearSingleTap],
  );

  const onTouchMove = useCallback((e: GestureResponderEvent) => {
    const t = tap.current;
    if (!t.tracking) return;
    if (touchCount(e) > 1) t.multi = true;
    if (!isTapGesture(e.nativeEvent.pageX - t.startX, e.nativeEvent.pageY - t.startY, 0)) {
      t.moved = true;
    }
  }, []);

  const onTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      const t = tap.current;
      if (!t.tracking || touchCount(e) > 0) return;
      t.tracking = false;
      if (!enabledRef.current || t.multi || t.moved) return;
      const now = Date.now();
      const { pageX, pageY, locationX, locationY } = e.nativeEvent;
      if (!isTapGesture(pageX - t.startX, pageY - t.startY, now - t.startAt)) return;

      const current = { at: now, x: pageX, y: pageY };
      if (isDoubleTap(lastTapRef.current, current)) {
        lastTapRef.current = null;
        clearSingleTap();
        const nextScale = nextDoubleTapScale(live.current.scale);
        if (!isZoomed(nextScale)) {
          applyTransform(VIEWER_MIN_SCALE, 0, 0, true);
          return;
        }
        const { width, height } = live.current;
        const focal = focalZoomOffset(locationX, locationY, width, height, nextScale);
        const clamped = clampToFrame(nextScale, focal.x, focal.y);
        applyTransform(nextScale, clamped.x, clamped.y, true);
        return;
      }

      lastTapRef.current = current;
      clearSingleTap();
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        lastTapRef.current = null;
        if (enabledRef.current) onToggleRef.current();
      }, FEED_DOUBLE_TAP_MS);
    },
    [applyTransform, clampToFrame, clearSingleTap],
  );

  const onTouchCancel = useCallback(() => {
    tap.current.tracking = false;
  }, []);

  const touchHandlers = useMemo(
    () => ({ onTouchStart, onTouchMove, onTouchEnd, onTouchCancel }),
    [onTouchCancel, onTouchEnd, onTouchMove, onTouchStart],
  );

  useEffect(() => {
    if (enabled && active) return;
    clearSingleTap();
    lastTapRef.current = null;
    gesture.current.pinching = false;
    applyTransform(VIEWER_MIN_SCALE, 0, 0, false);
  }, [active, applyTransform, clearSingleTap, enabled]);

  useEffect(() => {
    clearSingleTap();
    lastTapRef.current = null;
    gesture.current.pinching = false;
    applyTransform(VIEWER_MIN_SCALE, 0, 0, false);
  }, [applyTransform, clearSingleTap, resetKey]);

  useEffect(() => () => clearSingleTap(), [clearSingleTap]);

  const onLayout = useCallback((width: number, height: number) => {
    live.current.width = width;
    live.current.height = height;
  }, []);

  const animatedStyle = useMemo(
    () => ({
      transform: [{ translateX }, { translateY }, { scale }],
    }),
    [scale, translateX, translateY],
  );

  return {
    panHandlers: panResponder.panHandlers,
    touchHandlers,
    animatedStyle,
    onLayout,
    resetZoom,
  };
}
