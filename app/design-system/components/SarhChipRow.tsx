import type { ReactNode, Ref } from 'react';
import {
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { FILTER_CHIP } from '@/components/ui/filterChipTokens';

export type SarhChipRowProps = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Horizontal inset around the row (default 16). */
  contentPaddingHorizontal?: number;
  /** Optional handle + scroll/layout callbacks (e.g. keep a selected tab in view). */
  scrollRef?: Ref<ScrollView>;
  scrollProps?: Pick<ScrollViewProps, 'onScroll' | 'onLayout' | 'onContentSizeChange' | 'scrollEventThrottle'>;
};

/** Horizontal scroller for SarhChip items — RTL-aware, no flex stretch. */
export function SarhChipRow({
  children,
  contentContainerStyle,
  style,
  contentPaddingHorizontal = 16,
  scrollRef,
  scrollProps,
}: SarhChipRowProps) {
  const styles = useThemedStyles(({ colors }) => createRowStyles(colors));

  return (
    <ScrollView
      ref={scrollRef}
      {...scrollProps}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="scrollbar"
      style={[styles.scroll, style]}
      contentContainerStyle={[
        styles.content,
        getRtlRow(),
        { paddingHorizontal: contentPaddingHorizontal },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

function createRowStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    scroll: {
      flexGrow: 0,
      flexShrink: 0,
    },
    content: {
      alignItems: 'center',
      gap: FILTER_CHIP.gap,
      paddingVertical: 2,
    },
  });
}

export default SarhChipRow;
