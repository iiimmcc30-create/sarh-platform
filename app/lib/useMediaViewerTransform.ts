import {
  clampPan,
  clampViewerScale,
  isZoomed,
  shouldDismissFromSwipe,
  VIEWER_MAX_SCALE,
  VIEWER_SWIPE_AXIS_RATIO,
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

function clampPanForGesture(
  tx: number,
  ty: number,
  nextScale: number,
  bw: number,
  bh: number,
  fw: number,
  fh: number,
) {
  'worklet';
  return clampPan(tx, ty, nextScale, { width: bw, height: bh }, { width: fw, height: fh });
}

/** transform: images (Reanimated scale). nativeLayout: video (left/top/width/height only). */
export type MediaViewerZoomStyle = 'transform' | 'nativeLayout';

export function useMediaViewerTransform(options: {
  box: Box;
  frame: Box;
  onZoomedChange: (zoomed: boolean) => void;
  onToggleOverlay: () => void;
  onDismiss: () => void;
  enabled: boolean;
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
  const frameWidth = useSharedValue(frame.width);
  const frameHeight = useSharedValue(frame.height);

  useEffect(() => {
    boxWidth.value = box.width;
    boxHeight.value = box.height;
    frameWidth.value = frame.width;
    frameHeight.value = frame.height;
  }, [box.height, box.width, frame.height, frame.width, boxHeight, boxWidth, frameHeight, frameWidth]);

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
          const clamped = clampPanForGesture(
            translateX.value,
            translateY.value,
            next,
            boxWidth.value,
            boxHeight.value,
            frameWidth.value,
            frameHeight.value,
          );
          translateX.value = clamped.x;
          translateY.value = clamped.y;
          runOnJS(notifyZoomed)(next);
        })
        .onEnd(() => {
          runOnJS(settleTransform)(scale.value, translateX.value, translateY.value);
        }),
    [
      boxHeight,
      boxWidth,
      enabled,
      frameHeight,
      frameWidth,
      notifyZoomed,
      pinchStartScale,
      scale,
      settleTransform,
      translateX,
      translateY,
    ],
  );

  const panZoomed = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .minPointers(1)
        .maxPointers(1)
        .manualActivation(true)
        .onTouchesMove((_, state) => {
          if (isZoomed(scale.value)) {
            state.activate();
          } else {
            state.fail();
          }
        })
        .onBegin(() => {
          panStartX.value = translateX.value;
          panStartY.value = translateY.value;
        })
        .onUpdate((e) => {
          const clamped = clampPanForGesture(
            panStartX.value + e.translationX,
            panStartY.value + e.translationY,
            scale.value,
            boxWidth.value,
            boxHeight.value,
            frameWidth.value,
            frameHeight.value,
          );
          translateX.value = clamped.x;
          translateY.value = clamped.y;
        })
        .onEnd(() => {
          runOnJS(settleTransform)(scale.value, translateX.value, translateY.value);
        }),
    [
      boxHeight,
      boxWidth,
      enabled,
      frameHeight,
      frameWidth,
      panStartX,
      panStartY,
      scale,
      settleTransform,
      translateX,
      translateY,
    ],
  );

  const panDismiss = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .minPointers(1)
        .maxPointers(1)
        .activeOffsetY(12)
        .failOffsetX([-28, 28])
        .onBegin(() => {
          panStartY.value = translateY.value;
        })
        .onUpdate((e) => {
          if (isZoomed(scale.value)) return;
          if (e.translationY > 0 && e.translationY >= Math.abs(e.translationX) * VIEWER_SWIPE_AXIS_RATIO) {
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
    [enabled, panStartY, scale, settleTransform, translateX, translateY],
  );

  const tapToggle = useMemo(
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
    () =>
      Gesture.Simultaneous(
        pinch,
        Gesture.Race(panZoomed, panDismiss, tapToggle),
      ),
    [pinch, panDismiss, panZoomed, tapToggle],
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
    (cur, prev) => {
      if (zoomStyle !== 'nativeLayout') return;
      if (
        prev &&
        cur.s === prev.s &&
        cur.tx === prev.tx &&
        cur.ty === prev.ty &&
        cur.bw === prev.bw &&
        cur.bh === prev.bh
      ) {
        return;
      }
      runOnJS(pushVideoLayout)(cur.s, cur.tx, cur.ty, cur.bw, cur.bh);
    },
    [zoomStyle, pushVideoLayout],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return {
    gesture: composed,
    animatedStyle,
    videoLayout: zoomStyle === 'nativeLayout' ? videoLayout : null,
    resetTransform,
    maxScale: VIEWER_MAX_SCALE,
  };
}
