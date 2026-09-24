import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing } from 'react-native';
import {
  FADE_SCALE_BACK_MS,
  FADE_SCALE_FROM,
  FADE_SCALE_OPEN_MS,
} from '@/lib/screenTransition';

export type MediaOriginRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Measureable = {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

export function measureMediaOrigin(
  node: Measureable | null | undefined,
): Promise<MediaOriginRect | null> {
  return new Promise((resolve) => {
    if (!node || typeof node.measureInWindow !== 'function') {
      resolve(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (!width || !height) {
        resolve(null);
        return;
      }
      resolve({ x, y, width, height });
    });
  });
}

export function heroFromScale(
  origin: MediaOriginRect | null | undefined,
  screenW?: number,
  screenH?: number,
): number {
  if (!origin || origin.width <= 0 || origin.height <= 0) return FADE_SCALE_FROM;
  const width = screenW ?? Dimensions.get('window').width;
  const height = screenH ?? Dimensions.get('window').height;
  return Math.max(0.2, Math.min(origin.width / width, origin.height / height));
}

/**
 * Enter animation only. Final scale is always 1 — never inherit the thumbnail
 * box (often a cropped 16:11 tile) or the video will appear zoomed.
 */
export function heroMediaStyle(
  progress: Animated.Value,
  origin?: MediaOriginRect | null,
) {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const fadeScale = {
    scale: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [FADE_SCALE_FROM, 1],
    }),
  };

  if (!origin || origin.width <= 0 || origin.height <= 0) {
    return {
      opacity: progress,
      transform: [fadeScale],
    };
  }

  const originCx = origin.x + origin.width / 2;
  const originCy = origin.y + origin.height / 2;

  return {
    opacity: progress,
    transform: [
      {
        translateX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [originCx - screenW / 2, 0],
        }),
      },
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [originCy - screenH / 2, 0],
        }),
      },
      fadeScale,
    ],
  };
}

export function useHeroMediaTransition(
  visible: boolean,
  origin: MediaOriginRect | null | undefined,
  onClosed: () => void,
) {
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const closingRef = useRef(false);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const runClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: FADE_SCALE_BACK_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        closingRef.current = false;
        return;
      }
      setMounted(false);
      closingRef.current = false;
      onClosedRef.current();
    });
  }, [progress]);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      setMounted(true);
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: FADE_SCALE_OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    if (mounted && !closingRef.current) {
      runClose();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps -- open/close only tracks `visible`

  return {
    mounted,
    progress,
    heroStyle: heroMediaStyle(progress, origin),
    requestClose: runClose,
  };
}
