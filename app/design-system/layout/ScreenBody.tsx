import type { ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppScrollView } from '@/components/ui/AppScrollView';
import { ds } from '@/constants/designSystem';
import { useLayout, type ContentWidth } from '@/hooks/useLayout';
import { BOTTOM_ACTION_MIN_HEIGHT, GAP, type GapToken } from './metrics';
import { ScreenBodyContentInsetContext } from './screenBodyContentInset';

export { useScreenBodyContentInset } from './screenBodyContentInset';

/** Space reserved under the content so a fixed layer never covers it. */
export type ScreenBodyInset = 'none' | 'tabBar' | 'action';

export type ScreenBodyProps = {
  children?: ReactNode;
  /** Scrollable by default. Set false for a fixed body that hosts its own list. */
  scroll?: boolean;
  /** Apply the responsive horizontal gutter. Turn off for full-bleed screens. */
  gutter?: boolean;
  width?: ContentWidth;
  gap?: GapToken;
  /** Breathing room between the navigation chrome and the first block. */
  padTop?: GapToken;
  /** Scroll breathing room under the last block. Added to `bottomInset`. */
  padBottom?: GapToken;
  bottomInset?: ScreenBodyInset;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  refreshControl?: ScrollViewProps['refreshControl'];
  /** Children that pin to the top while the rest scrolls, e.g. a tab bar. */
  stickyHeaderIndices?: number[];
  onScroll?: ScrollViewProps['onScroll'];
  onScrollEndDrag?: ScrollViewProps['onScrollEndDrag'];
  onMomentumScrollEnd?: ScrollViewProps['onMomentumScrollEnd'];
  scrollEventThrottle?: ScrollViewProps['scrollEventThrottle'];
  /** Forwarded to AppScrollView. Default keeps the shared tab-shell chrome. */
  bindChromeScroll?: boolean;
  testID?: string;
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

/**
 * The content container. Owns the horizontal gutter, the responsive max
 * width, the bottom inset, and scroll defaults.
 *
 * Screens must not set `paddingHorizontal` or `maxWidth` themselves. Media
 * and hero blocks that need the full width use `<FullBleed>`.
 */
export function ScreenBody({
  children,
  scroll = true,
  gutter = true,
  width = 'content',
  gap = 'none',
  padTop = 'none',
  padBottom = 'none',
  bottomInset = 'none',
  contentContainerStyle,
  style,
  refreshControl,
  stickyHeaderIndices,
  onScroll,
  onScrollEndDrag,
  onMomentumScrollEnd,
  scrollEventThrottle,
  bindChromeScroll,
  testID,
}: ScreenBodyProps) {
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const maxWidth = layout.maxWidthFor(width);

  const reserved =
    bottomInset === 'tabBar'
      ? ds.tabBar.height + insets.bottom
      : bottomInset === 'action'
        ? BOTTOM_ACTION_MIN_HEIGHT + insets.bottom
        : 0;
  const contentPaddingBottom = reserved + GAP[padBottom];

  const content: StyleProp<ViewStyle>[] = [
    {
      paddingHorizontal: gutter ? layout.gutter : 0,
      paddingTop: GAP[padTop],
      // Overlay tab/action bars: keep inset on scroll *content*, never as a
      // flex-wrapper hole. Wrapper padding stays painted after chrome hides.
      paddingBottom: scroll ? contentPaddingBottom : 0,
      gap: GAP[gap],
    },
    maxWidth != null ? { maxWidth, width: '100%', alignSelf: 'center' } : null,
    contentContainerStyle,
  ];

  const nestedListInset = scroll ? 0 : contentPaddingBottom;

  if (!scroll) {
    return (
      <ScreenBodyContentInsetContext.Provider value={nestedListInset}>
        <View testID={testID} style={[styles.fill, content, style]}>
          {children}
        </View>
      </ScreenBodyContentInsetContext.Provider>
    );
  }

  return (
    <ScreenBodyContentInsetContext.Provider value={nestedListInset}>
      <AppScrollView
        testID={testID}
        style={[styles.fill, style]}
        contentContainerStyle={content}
        refreshControl={refreshControl}
        stickyHeaderIndices={stickyHeaderIndices}
        onScroll={onScroll}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={scrollEventThrottle}
        bindChromeScroll={bindChromeScroll}
      >
        {children}
      </AppScrollView>
    </ScreenBodyContentInsetContext.Provider>
  );
}

export type FullBleedProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Escape the `ScreenBody` gutter for hero images, carousels, and maps. */
export function FullBleed({ children, style, testID }: FullBleedProps) {
  const { gutter } = useLayout();
  return (
    <View testID={testID} style={[{ marginHorizontal: -gutter }, style]}>
      {children}
    </View>
  );
}

export default ScreenBody;
