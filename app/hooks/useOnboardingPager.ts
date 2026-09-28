import {
  isLastOnboardingIndex,
  onboardingIndexForOffset,
  onboardingOffsetForIndex,
  onboardingProgressRange,
  previousOnboardingIndex,
  resolveOnboardingNext,
  resolveOnboardingPagerMode,
} from '@/lib/onboardingFlow';
import { isAppRtl } from '@/lib/rtl';
import { clampTabIndex } from '@/lib/tabPager';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Platform,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

type Options = {
  count: number;
  /** Starting page width (window width); the pager re-measures on layout. */
  initialWidth: number;
  onFinish: () => void;
};

/** Programmatic moves ignore intermediate offsets until they land (or time out). */
const PENDING_TIMEOUT_MS = 900;

/**
 * Onboarding pager on a plain horizontal paging ScrollView (RN Animated only).
 *
 * The logical index is derived from `onScroll` offsets (react-native-web never
 * emits onMomentumScrollEnd), so the CTA, dots and skip stay in sync on web,
 * iOS and Android. Buttons move through `goTo`, which updates the index
 * immediately (rapid taps advance page by page).
 */
export function useOnboardingPager({ count, initialWidth, onFinish }: Options) {
  const pagerRef = useRef<ScrollView>(null);
  const mode = useMemo(() => resolveOnboardingPagerMode(isAppRtl(), Platform.OS), []);
  const rtl = mode !== 'ltr';

  const [width, setWidth] = useState(() => (initialWidth > 0 ? initialWidth : 1));
  const widthRef = useRef(width);

  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const pendingRef = useRef<number | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceMotionRef = useRef(false);

  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  // Stable across renders; created once (no ref reads during render).
  const [initialOffset] = useState(() => ({
    x: onboardingOffsetForIndex(0, width, count, mode),
    y: 0,
  }));
  const [scrollX] = useState(() => new Animated.Value(initialOffset.x));

  const progress = useMemo(
    () =>
      scrollX.interpolate({
        ...onboardingProgressRange(width, count, mode),
        extrapolate: 'clamp',
      }),
    [count, mode, scrollX, width],
  );

  const commitIndex = useCallback((next: number) => {
    if (indexRef.current === next) return;
    indexRef.current = next;
    setIndex(next);
  }, []);

  const clearPending = useCallback(() => {
    pendingRef.current = null;
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
  }, []);

  const goTo = useCallback(
    (target: number) => {
      const safe = clampTabIndex(target, count);
      const animated = !reduceMotionRef.current;
      clearPending();
      if (animated) {
        pendingRef.current = safe;
        pendingTimer.current = setTimeout(clearPending, PENDING_TIMEOUT_MS);
      }
      commitIndex(safe);
      const x = onboardingOffsetForIndex(safe, widthRef.current, count, mode);
      if (!animated) scrollX.setValue(x);
      pagerRef.current?.scrollTo({ x, y: 0, animated });
    },
    [clearPending, commitIndex, count, mode, scrollX],
  );

  const next = useCallback(() => {
    const action = resolveOnboardingNext(indexRef.current, count);
    if (action.type === 'finish') {
      onFinishRef.current();
      return;
    }
    goTo(action.index);
  }, [count, goTo]);

  const handleOffset = useCallback(
    (x: number) => {
      const w = widthRef.current;
      const pending = pendingRef.current;
      if (pending != null) {
        if (Math.abs(x - onboardingOffsetForIndex(pending, w, count, mode)) < 1) clearPending();
        return;
      }
      commitIndex(onboardingIndexForOffset(x, w, count, mode));
    },
    [clearPending, commitIndex, count, mode],
  );
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        // Dots animate width (a layout prop) and web has no native driver.
        useNativeDriver: false,
      }),
    [scrollX],
  );

  // Every offset (drag, momentum, programmatic) drives the logical index.
  useEffect(() => {
    const id = scrollX.addListener(({ value }) => handleOffset(value));
    return () => scrollX.removeListener(id);
  }, [handleOffset, scrollX]);

  /** A user drag takes over from any programmatic move. */
  const onScrollBeginDrag = useCallback(() => clearPending(), [clearPending]);

  /** Native settle: final offset decides the page. */
  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      clearPending();
      handleOffset(event.nativeEvent.contentOffset.x);
    },
    [clearPending, handleOffset],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - widthRef.current) > 0.5) {
      widthRef.current = w;
      setWidth(w);
    }
  }, []);

  // Width change (web resize / rotation): keep the current page aligned.
  useEffect(() => {
    widthRef.current = width;
    const x = onboardingOffsetForIndex(indexRef.current, width, count, mode);
    scrollX.setValue(x);
    const frame = requestAnimationFrame(() => {
      pagerRef.current?.scrollTo({ x, y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [count, mode, scrollX, width]);

  // Reduced motion: no animated paging, fade-only slide transitions.
  useEffect(() => {
    let alive = true;
    const apply = (value: boolean) => {
      if (!alive) return;
      reduceMotionRef.current = value;
      setReduceMotion(value);
    };
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => apply(Boolean(value)))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) =>
      apply(Boolean(value)),
    );
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  // Android back: previous slide first, then the system default.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const prev = previousOnboardingIndex(indexRef.current, count);
      if (prev == null) return false;
      goTo(prev);
      return true;
    });
    return () => sub.remove();
  }, [count, goTo]);

  useEffect(() => clearPending, [clearPending]);

  return {
    index,
    isLast: isLastOnboardingIndex(index, count),
    count,
    width,
    mode,
    progress,
    reduceMotion,
    goTo,
    next,
    pagerProps: {
      ref: pagerRef,
      horizontal: true,
      pagingEnabled: true,
      bounces: false,
      showsHorizontalScrollIndicator: false,
      scrollEventThrottle: 16,
      onScroll,
      onScrollBeginDrag,
      onMomentumScrollEnd,
      onLayout,
      contentOffset: initialOffset,
      style: { direction: rtl ? ('rtl' as const) : ('ltr' as const) },
    },
  };
}

export type OnboardingPagerState = ReturnType<typeof useOnboardingPager>;
