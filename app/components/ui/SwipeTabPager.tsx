import { isTabPageNear } from '@/lib/tabPager';
import type { SwipeTabPagerState } from '@/hooks/useSwipeTabPager';
import { useCallback, useState, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  pager: SwipeTabPagerState;
  renderPage: (page: number, active: boolean) => ReactNode;
  /**
   * `fill`: the pager fills its parent and every page is full height (as /bookmarks),
   * each page owning its own vertical list.
   * `content`: the pager lives inside a parent vertical ScrollView. Only the active
   * page and its neighbours render; neighbours are clipped to the active page's
   * height so the parent never scrolls into a taller hidden page.
   */
  fit?: 'fill' | 'content';
  pageStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
};

/** Renders the /bookmarks horizontal paging ScrollView from useSwipeTabPager state. */
export function SwipeTabPager({ pager, renderPage, fit = 'fill', pageStyle, style }: Props) {
  const { index, count, width, rtl, pagerProps } = pager;
  const [activeHeight, setActiveHeight] = useState(0);
  const onActiveLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.height);
    setActiveHeight((prev) => (prev === next ? prev : next));
  }, []);

  const pages: ReactNode[] = [];
  for (let page = 0; page < count; page += 1) {
    const active = page === index;
    if (fit === 'fill') {
      pages.push(
        <View key={page} style={[styles.fillPage, { width }, pageStyle]}>
          {renderPage(page, active)}
        </View>,
      );
      continue;
    }
    pages.push(
      <View
        key={page}
        style={[{ width }, pageStyle, active ? null : { height: activeHeight, overflow: 'hidden' }]}
        onLayout={active ? onActiveLayout : undefined}
      >
        {isTabPageNear(page, index) ? renderPage(page, active) : null}
      </View>,
    );
  }

  return (
    <ScrollView
      {...pagerProps}
      contentContainerStyle={fit === 'content' ? styles.contentRow : undefined}
      style={[fit === 'fill' ? styles.fill : null, { direction: rtl ? 'rtl' : 'ltr' }, style]}
    >
      {pages}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  fillPage: {
    flex: 1,
  },
  /** Pages keep their natural height (no cross-axis stretch to the tallest page). */
  contentRow: {
    alignItems: 'flex-start',
  },
});