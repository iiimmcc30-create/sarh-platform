import { isHorizontalPagerRtl } from '@/lib/mediaViewerPaging';
import { resolveTabPagerMode, revealTabOffset, type TabLayout } from '@/lib/tabPager';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

/**
 * Measured frames of a tab row's tabs (onLayout, physical px within the row),
 * so the swipe indicator lands exactly under tabs of different label widths.
 */
export function useTabLayouts(count: number) {
  const [layouts, setLayouts] = useState<(TabLayout | undefined)[]>([]);

  const onTabLayout = useCallback((tabIndex: number, event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setLayouts((prev) => {
      const old = prev[tabIndex];
      if (
        old &&
        Math.abs(old.x - x) < 0.5 &&
        Math.abs(old.y - y) < 0.5 &&
        Math.abs(old.width - width) < 0.5 &&
        Math.abs(old.height - height) < 0.5
      ) {
        return prev;
      }
      const next = prev.slice();
      next[tabIndex] = { x, y, width, height };
      return next;
    });
  }, []);

  const visible = useMemo(() => layouts.slice(0, count), [count, layouts]);
  return { layouts: visible, onTabLayout };
}

/**
 * Horizontally scrolling tab row: when the selected tab changes (tap or pager
 * swipe) scroll the row just enough to show it, so the indicator never ends
 * under an off-screen tab. Spread `rowProps` on the row's ScrollView.
 */
export function useRevealActiveTab(activeIndex: number, layouts: readonly (TabLayout | undefined)[]) {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const viewport = useRef(0);
  const content = useRef(0);
  const shownIndex = useRef(activeIndex);
  const mode = resolveTabPagerMode(isHorizontalPagerRtl(), Platform.OS);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.x;
  }, []);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    viewport.current = event.nativeEvent.layout.width;
  }, []);
  const onContentSizeChange = useCallback((width: number) => {
    content.current = width;
  }, []);

  useEffect(() => {
    if (shownIndex.current === activeIndex) return;
    const tab = layouts[activeIndex];
    if (!tab) return;
    shownIndex.current = activeIndex;
    const next = revealTabOffset({
      tabX: tab.x,
      tabWidth: tab.width,
      contentWidth: content.current,
      viewportWidth: viewport.current,
      currentOffset: offset.current,
      mode,
    });
    if (Math.abs(next - offset.current) < 1) return;
    offset.current = next;
    scrollRef.current?.scrollTo({ x: next, y: 0, animated: true });
  }, [activeIndex, layouts, mode]);

  return {
    scrollRef,
    rowProps: { onScroll, onLayout, onContentSizeChange, scrollEventThrottle: 16 },
  };
}
