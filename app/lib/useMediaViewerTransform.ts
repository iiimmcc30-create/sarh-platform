import {
  clampPan,
  clampViewerScale,
  isZoomed,
  shouldDismissFromSwipe,
  VIEWER_MAX_SCALE,
} from '@/lib/mediaViewerGestures';
import {
  mediaViewerVideoLayout,
  type MediaViewerVideoLayout,
} from '@/lib/mediaViewerVideoLayout';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type Box = { width: number; height: number };

const SPRING = { damping: 22, stiffness: 280 };

/** transform: images (Reanimated scale). nativeLayout: video (left/top/width/height only). */
export type MediaViewerZoomStyle = 'transform' | 'nativeLayout';

export function useMediaViewerTransform(options: {
  box: Box;
  frame: Box;
  onZoomedChange: (zoomed: boolean) => void;
  onToggleOverlay: () => void;
  onDismiss: () => void;
  enabled: boolean;
  /**
   * Android VideoView stops updating when any Reanimated transform wraps it.
   * Video slides use nativeLayout (plain View geometry, no transform on the player tree).
   */
  zoomStyle?: MediaViewerZoomStyle;
}) {
  const {
    box,
    frame,
    onZoomedChange,
    onToggleOverlay,
    onDismiss,
    enabled,
    zoomStyle = 'transform',
  } = options;

  const scale = useSharedValue(1);
  const boxWidth = useSharedValue(box.width);
  const boxHeight = useSharedValue(box.height);

  useEffect(() => {
    boxWidth.value = box.width;
    boxHeight.value = box.height;
  }, [box.height, box.width, boxHeight, boxWidth]);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const pinchStartScale = useSharedValue(1);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const resetTransform = useCallback(
    (animated: boolean) => {
      scale.value = animated ? withSpring(1, SPRING) : 1;
      translateX.value = animated ? withSpring(0, SPRING) : 0;
      translateY.value = animated ? withSpring(0, SPRING) : 0;
      onZoomedChange(false);
    },
    [onZoomedChange, scale, translateX, translateY],
  );

  const notifyZoomed = useCallback(
    (nextScale: number) => {
      onZoomedChange(isZoomed(nextScale));
    },
    [onZoomedChange],
  );

  const settleTransform = useCallback(
    (nextScale: number, tx: number, ty: number) => {
      const clampedScale = clampViewerScale(nextScale);
      if (!isZoomed(clampedScale)) {
        if (shouldDismissFromSwipe(ty, clampedScale)) {
          onDismiss();
          return;
        }
        resetTransform(true);
        return;
      }
      const clamped = clampPan(tx, ty, clampedScale, box, frame);
      scale.value = withSpring(clampedScale, SPRING);
      translateX.value = withSpring(clamped.x, SPRING);
      translateY.value = withSpring(clamped.y, SPRING);
      notifyZoomed(clampedScale);
    },
    [box, frame, notifyZoomed, onDismiss, resetTransform, scale, translateX, translateY],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(enabled)
        .onBegin(() => {
          pinchStartScale.value = scale.value;
        })
        .onUpdate((e) => {
          const next = clampViewerScale(pinchStartScale.value * e.scale);
          scale.value = next;
          const clamped = clampPan(
            translateX.value,
            translateY.value,
            next,
            box,
            frame,
          );
          translateX.value = clamped.x;
          translateY.value = clamped.y;
          runOnJS(notifyZoomed)(next);
        })
        .onEnd(() => {
          runOnJS(settleTransform)(scale.value, translateX.value, translateY.value);
        }),
    [box, enabled, frame, notifyZoomed, pinchStartScale, scale, settleTransform, translateX, translateY],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .minPointers(1)
        .maxPointers(1)
        .activeOffsetY([-9999, 12])
        .onBegin(() => {
          panStartX.value = translateX.value;
          panStartY.value = translateY.value;
        })
        .onUpdate((e) => {
          if (isZoomed(scale.value)) {
            const clamped = clampPan(
              panStartX.value + e.translationX,
              panStartY.value + e.translationY,
              scale.value,
              box,
              frame,
            );
            translateX.value = clamped.x;
            translateY.value = clamped.y;
            return;
          }
          if (e.translationY > 0 && e.translationY >= Math.abs(e.translationX)) {
            translateY.value = e.translationY;
          }
        })
        .onEnd((e) => {
          if (isZoomed(scale.value)) {
            runOnJS(settleTransform)(scale.value, translateX.value, translateY.value);
            return;
          }
          runOnJS(settleTransform)(1, 0, e.translationY);
        }),
    [enabled, frame, box, panStartX, panStartY, scale, settleTransform, translateX, translateY],
  );

  const doubleTapBlocked = useMemo(
    () =>
      Gesture.Tap()
        .enabled(enabled)
        .numberOfTaps(1)
        .maxDuration(280)
        .onEnd(() => {
          runOnJS(onToggleOverlay)();
        }),
    [enabled, onToggleOverlay],
  );

  const composed = useMemo(
    () => Gesture.Simultaneous(pinch, Gesture.Race(pan, doubleTapBlocked)),
    [pinch, pan, doubleTapBlocked],
  );

  const [videoLayout, setVideoLayout] = useState<MediaViewerVideoLayout>(() =>
    mediaViewerVideoLayout(box, frame, 1, 0, 0),
  );

  useEffect(() => {
    setVideoLayout(mediaViewerVideoLayout(box, frame, 1, 0, 0));
  }, [box.height, box.width, frame.height, frame.width]);

  const pushVideoLayout = useCallback(
    (nextScale: number, tx: number, ty: number, bw: number, bh: number) => {
      setVideoLayout(
        mediaViewerVideoLayout({ width: bw, height: bh }, frame, nextScale, tx, ty),
      );
    },
    [frame],
  );

  useAnimatedReaction(
    () => ({
      s: scale.value,
      tx: translateX.value,
      ty: translateY.value,
      bw: boxWidth.value,
      bh: boxHeight.value,
    }),
    (cur) => {
      if (zoomStyle !== 'nativeLayout') return;
      runOnJS(pushVideoLayout)(cur.s, cur.tx, cur.ty, cur.bw, cur.bh);
    },
    [zoomStyle, pushVideoLayout],
  );

  const animatedStyle = useAnimatedStyle(() => {
    if (zoomStyle === 'nativeLayout') {
      return {};
    }
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  return {
    gesture: composed,
    animatedStyle,
    videoLayout: zoomStyle === 'nativeLayout' ? videoLayout : null,
    resetTransform,
    maxScale: VIEWER_MAX_SCALE,
  };
}
