import { isHorizontalPagerRtl } from '@/lib/mediaViewerPaging';
import {
  clampTabIndex,
  isTabPagerAligned,
  resolveSwipeIndexForMode,
  resolveTabPagerMode,
  tabPagerOffsetForMode,
  tabPagerProgressRange,
} from '@/lib/tabPager';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

type Options = {
  count: number;
  /** Starting page width (window width); the pager re-measures its own width on layout. */
  width: number;
  initialIndex?: number;
  /** Veto a swipe target (the pager snaps back). Tab presses are guarded by the caller. */
  canSelect?: (index: number) => boolean;
  /**
   * Drive `progress` from the scroll on the native driver (iOS / Android): the
   * tab bar follows taps and swipes on the UI thread, even while JS renders the
   * next page. Only for consumers that animate transform / opacity from
   * `progress` (no width), e.g. ProfileTabs. The pager then needs an
   * Animated.ScrollView (SwipeTabPager picks it from `nativeDriver`).
   */
  nativeDriver?: boolean;
};

/** Programmatic moves ignore intermediate offsets until they land (or time out). */
const PENDING_TIMEOUT_MS = 900;
/** Web has no momentum-end event: a scroll that rests this long has settled. */
const WEB_SETTLE_MS = 140;

/**
 * The /bookmarks swipe-tab pager as a hook: ONE `index` drives the tab and the
 * page, and a continuous `progress` (0 .. count - 1, follows the finger) drives
 * the indicator. Tap -> index + animated scrollTo the page offset; swipe -> the
 * settled offset maps back to the index once (momentum end on native; resting
 * on a page / scroll idle on web, where onMomentumScrollEnd never fires), so a
 * swipe selects exactly like a tap and never mid-drag.
 *
 * Offsets are platform-aware (`TabPagerMode`): native RTL keeps physical offsets
 * from the left, web RTL scrolls in negative scrollLeft. Horizontal paging
 * ScrollView, no scrollbar, no bounce, RN Animated only.
 */
export function useSwipeTabPager({
  count,
  width: initialWidth,
  initialIndex = 0,
  canSelect,
  nativeDriver = false,
}: Options) {
  const useNativeScroll = nativeDriver && Platform.OS !== 'web';
  const pagerRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(() => clampTabIndex(initialIndex, count));
  const indexRef = useRef(index);
  const rtl = isHorizontalPagerRtl();
  const mode = resolveTabPagerMode(rtl, Platform.OS);

  const [measuredWidth, setMeasuredWidth] = useState(0);
  const width = measuredWidth > 0 ? measuredWidth : initialWidth > 0 ? initialWidth : 1;
  const widthRef = useRef(width);

  const canSelectRef = useRef(canSelect);
  useEffect(() => {
    canSelectRef.current = canSelect;
  }, [canSelect]);

  const pendingRef = useRef<number | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastContentWidth = useRef(0);
  /** The ScrollView instance last aligned on layout (search remounts its pager). */
  const laidOutInstance = useRef<ScrollView | null>(null);

  const [initialOffset] = useState(() => ({ x: tabPagerOffsetForMode(index, width, count, mode), y: 0 }));
  const [scrollX] = useState(() => new Animated.Value(initialOffset.x));

  /** Logical position 0 .. count - 1, tracking the drag (drives the indicator). */
  const progress = useMemo(
    () => scrollX.interpolate({ ...tabPagerProgressRange(width, count, mode), extrapolate: 'clamp' }),
    [count, mode, scrollX, width],
  );

  const commitIndex = useCallback((next: number) => {
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

  const clearSettle = useCallback(() => {
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  /** Move the pager to `target` (animated moves ignore offsets until they land). */
  const scrollToIndex = useCallback(
    (target: number, animated: boolean) => {
      const x = tabPagerOffsetForMode(target, widthRef.current, count, mode);
      clearPending();
      clearSettle();
      const pager = pagerRef.current;
      if (animated && pager) {
        pendingRef.current = target;
        pendingTimer.current = setTimeout(clearPending, PENDING_TIMEOUT_MS);
      } else {
        // Not mounted (e.g. tabs shown before the pager) or instant: the indicator follows now.
        scrollX.setValue(x);
      }
      pager?.scrollTo({ x, y: 0, animated });
    },
    [clearPending, clearSettle, count, mode, scrollX],
  );

  /** Tap: select the tab and move the pager to that page's offset. */
  const goTo = useCallback(
    (next: number) => {
      const safe = clampTabIndex(next, count);
      commitIndex(safe);
      scrollToIndex(safe, true);
    },
    [commitIndex, count, scrollToIndex],
  );

  /** Programmatic reset (no animation), e.g. leaving and re-entering a results view. */
  const jumpTo = useCallback(
    (next: number) => {
      const safe = clampTabIndex(next, count);
      commitIndex(safe);
      scrollToIndex(safe, false);
    },
    [commitIndex, count, scrollToIndex],
  );

  /** A swipe came to rest at `x`: select that page once (or snap back on veto). */
  const settle = useCallback(
    (x: number) => {
      clearSettle();
      const current = indexRef.current;
      const { next, vetoed } = resolveSwipeIndexForMode(
        x,
        widthRef.current,
        count,
        mode,
        current,
        canSelectRef.current,
      );
      if (vetoed) {
        scrollToIndex(current, true);
        return;
      }
      if (next != null) commitIndex(next);
    },
    [clearSettle, commitIndex, count, mode, scrollToIndex],
  );

  // Every offset (drag, momentum, programmatic) flows through scrollX.
  useEffect(() => {
    const id = scrollX.addListener(({ value }) => {
      const w = widthRef.current;
      const pending = pendingRef.current;
      if (pending != null) {
        if (Math.abs(value - tabPagerOffsetForMode(pending, w, count, mode)) < 1) clearPending();
        return;
      }
      if (Platform.OS !== 'web') return; // native settles in onMomentumScrollEnd
      clearSettle();
      if (isTabPagerAligned(value, w, count, mode)) {
        settle(value);
        return;
      }
      settleTimer.current = setTimeout(() => settle(value), WEB_SETTLE_MS);
    });
    return () => scrollX.removeListener(id);
  }, [clearPending, clearSettle, count, mode, scrollX, settle]);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        // Default: SwipeTabIndicator animates width from JS; web has no native driver.
        useNativeDriver: useNativeScroll,
      }),
    [scrollX, useNativeScroll],
  );

  /** A user drag takes over from any programmatic move. */
  const onScrollBeginDrag = useCallback(() => {
    clearPending();
    clearSettle();
  }, [clearPending, clearSettle]);

  /** Native swipe: the settled offset decides the index (never an LTR-only formula). */
  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      clearPending();
      settle(event.nativeEvent.contentOffset.x);
    },
    [clearPending, settle],
  );

  /** Keep the pager (and indicator) on the selected page without animation. */
  const positionPager = useCallback(() => {
    const x = tabPagerOffsetForMode(indexRef.current, widthRef.current, count, mode);
    clearPending();
    scrollX.setValue(x);
    pagerRef.current?.scrollTo({ x, y: 0, animated: false });
  }, [clearPending, count, mode, scrollX]);

  /**
   * Mount / rotation / resize: measure the real page width and re-align. Height
   * changes (content-height pages loading mid-swipe) never re-position.
   */
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const w = event.nativeEvent.layout.width;
      const remounted = laidOutInstance.current !== pagerRef.current;
      laidOutInstance.current = pagerRef.current;
      if (w > 0 && Math.abs(w - widthRef.current) > 0.5) {
        widthRef.current = w;
        setMeasuredWidth(w);
        positionPager();
        return;
      }
      if (remounted) positionPager();
    },
    [positionPager],
  );

  /** Only a width change re-positions: page heights grow as lists load mid-swipe. */
  const onContentSizeChange = useCallback(
    (contentWidth: number) => {
      if (contentWidth === lastContentWidth.current) return;
      lastContentWidth.current = contentWidth;
      positionPager();
    },
    [positionPager],
  );

  // Page count / width change (visitor vs own profile, resize): re-align.
  useEffect(() => {
    widthRef.current = width;
    const frame = requestAnimationFrame(positionPager);
    return () => cancelAnimationFrame(frame);
  }, [positionPager, width]);

  useEffect(
    () => () => {
      clearPending();
      clearSettle();
    },
    [clearPending, clearSettle],
  );

  return {
    index,
    progress,
    goTo,
    jumpTo,
    rtl,
    mode,
    count,
    width,
    nativeDriver: useNativeScroll,
    pagerProps: {
      ref: pagerRef,
      horizontal: true,
      pagingEnabled: true,
      bounces: false,
      showsHorizontalScrollIndicator: false,
      nestedScrollEnabled: true,
      onScroll,
      onScrollBeginDrag,
      onMomentumScrollEnd,
      onLayout,
      onContentSizeChange,
      contentOffset: initialOffset,
      scrollEventThrottle: 16,
    },
  };
}

export type SwipeTabPagerState = ReturnType<typeof useSwipeTabPager>;
