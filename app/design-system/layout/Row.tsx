import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { getRtlRow } from '@/lib/rtl';
import {
  ALIGN,
  GAP,
  JUSTIFY,
  type AlignToken,
  type GapToken,
  type JustifyToken,
} from './metrics';

export type RowProps = {
  children?: ReactNode;
  gap?: GapToken;
  align?: AlignToken;
  justify?: JustifyToken;
  wrap?: boolean;
  /** Take the remaining inline space and allow children to shrink. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  testID?: string;
};

/**
 * Logical horizontal row. Always `flexDirection: 'row'` plus the root
 * direction — never `row-reverse`, never an LTR island.
 *
 * This is the only place a screen should get a row from; it removes the need
 * to call `getRtlRow()` or set physical left/right margins by hand.
 */
export function Row({
  children,
  gap = 'sm',
  align = 'center',
  justify,
  wrap = false,
  fill = false,
  style,
  pointerEvents,
  testID,
}: RowProps) {
  return (
    <View
      testID={testID}
      pointerEvents={pointerEvents}
      style={[
        getRtlRow(),
        { alignItems: ALIGN[align], gap: GAP[gap] },
        justify ? { justifyContent: JUSTIFY[justify] } : null,
        wrap ? { flexWrap: 'wrap' } : null,
        fill ? { flex: 1, minWidth: 0 } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export default Row;
