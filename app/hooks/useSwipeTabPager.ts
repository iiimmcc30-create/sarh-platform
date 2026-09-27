import { isHorizontalPagerRtl } from '@/lib/mediaViewerPaging';
import { clampTabIndex, resolveSwipeIndex, tabPagerOffset } from '@/lib/tabPager';
import { useCallback, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

type Options = {
  count: number;
  /** Page width (the pager is full width, like /bookmarks). */
  width: number;
  initialIndex?: number;
  /** Veto a swipe target (the pager snaps back). Tab presses are guarded by the caller. */
  canSelect?: (index: number) => boolean;
};

/**
 * The /bookmarks swipe-tab pager as a hook: ONE `index` drives the tab, the
 * indicator and the pager position. Tap -> setIndex + animated scrollTo the
 * RTL-aware offset; swipe -> the settled physical offset maps back to the index
 * (onMomentumScrollEnd only, never per-frame). Horizontal paging ScrollView,
 * no scrollbar, no bounce, RN only (no Reanimated / pager / gesture libs).
 */
export function useSwipeTabPager({ count, width, initialIndex = 0, canSelect }: Options) {
  const pagerRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(() => clampTabIndex(initialIndex, count));
  const indexRef = useRef(index);
  indexRef.current = index;
  const rtl = isHorizontalPagerRtl();
  const canSelectRef = useRef(canSelect);
  canSelectRef.current = canSelect;
  const lastContentWidth = useRef(0);

  /** Tap: select the tab and move the pager to that page's physical offset. */
  const goTo = useCallback(
    (next: number) => {
      const safe = clampTabIndex(next, count);
      setIndex(safe);
      pagerRef.current?.scrollTo({ x: tabPagerOffset(safe, width, count, rtl), y: 0, animated: true });
    },
    [count, rtl, width],
  );

  /** Programmatic reset (no animation), e.g. leaving and re-entering a results view. */
  const jumpTo = useCallback(
    (next: number) => {
      const safe = clampTabIndex(next, count);
      setIndex(safe);
      pagerRef.current?.scrollTo({ x: tabPagerOffset(safe, width, count, rtl), y: 0, animated: false });
    },
    [count, rtl, width],
  );

  /** Swipe: the settled offset decides the index (never an LTR-only formula). */
  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const current = indexRef.current;
      const { next, vetoed } = resolveSwipeIndex(
        event.nativeEvent.contentOffset.x,
        width,
        count,
        rtl,
        current,
        canSelectRef.current,
      );
      if (vetoed) {
        pagerRef.current?.scrollTo({ x: tabPagerOffset(current, width, count, rtl), y: 0, animated: true });
        return;
      }
      if (next != null) setIndex(next);
    },
    [count, rtl, width],
  );

  /** Layout / rotation: keep the pager on the selected page. */
  const positionPager = useCallback(() => {
    pagerRef.current?.scrollTo({
      x: tabPagerOffset(indexRef.current, width, count, rtl),
      y: 0,
      animated: false,
    });
  }, [count, rtl, width]);

  const onLayout = useCallback((_event: LayoutChangeEvent) => positionPager(), [positionPager]);

  /** Only a width change re-positions: page heights grow as lists load mid-swipe. */
  const onContentSizeChange = useCallback(
    (contentWidth: number) => {
      if (contentWidth === lastContentWidth.current) return;
      lastContentWidth.current = contentWidth;
      positionPager();
    },
    [positionPager],
  );

  // Initial position only; later moves go through positionPager / goTo.
  const initialOffset = useRef({ x: tabPagerOffset(index, width, count, rtl), y: 0 }).current;

  return {
    index,
    goTo,
    jumpTo,
    rtl,
    count,
    width,
    pagerProps: {
      ref: pagerRef,
      horizontal: true,
      pagingEnabled: true,
      bounces: false,
      showsHorizontalScrollIndicator: false,
      onMomentumScrollEnd,
      onLayout,
      onContentSizeChange,
      contentOffset: initialOffset,
      scrollEventThrottle: 16,
    },
  };
}

export type SwipeTabPagerState = ReturnType<typeof useSwipeTabPager>;