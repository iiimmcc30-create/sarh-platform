import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { ALIGN, GAP, type AlignToken, type GapToken } from './metrics';

export type StackProps = {
  children?: ReactNode;
  gap?: GapToken;
  align?: AlignToken;
  /** Take the remaining block space. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Vertical rhythm. Spacing comes from the shared grid via `gap` — screens
 * should not add `marginBottom` between siblings.
 */
export function Stack({
  children,
  gap = 'md',
  align,
  fill = false,
  style,
  testID,
}: StackProps) {
  return (
    <View
      testID={testID}
      style={[
        { flexDirection: 'column', gap: GAP[gap] },
        align ? { alignItems: ALIGN[align] } : null,
        fill ? { flex: 1, minHeight: 0 } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export default Stack;
