import { Children, type ReactNode } from 'react';
import { View, type ViewProps, type ViewStyle } from 'react-native';
import { getCoverTrailRowStyle } from '@/lib/rtl';

export type CoverTrailRowProps = ViewProps & {
  /** When true the row itself grows inside a parent flex layout. */
  flex?: boolean;
  justify?: ViewStyle['justifyContent'];
  gap?: number;
};

/**
 * Logical RTL row. Leftover call sites passed [text, icon] under an LTR island;
 * children are reversed once so the icon stays at inline start.
 */
export function CoverTrailRow({
  flex,
  justify,
  gap,
  style,
  children,
  ...rest
}: CoverTrailRowProps) {
  const items = Children.toArray(children) as ReactNode[];
  return (
    <View
      style={[getCoverTrailRowStyle({ flex, justifyContent: justify, gap }), style]}
      {...rest}
    >
      {items.reverse()}
    </View>
  );
}

export default CoverTrailRow;
