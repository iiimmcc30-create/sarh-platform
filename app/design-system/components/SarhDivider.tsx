import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, space } from '../tokens';

export type SarhDividerProps = {
  inset?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function SarhDivider({ inset = false, style, accessibilityLabel }: SarhDividerProps) {
  return (
    <View
      accessibilityRole="none"
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={[
        {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
          marginHorizontal: inset ? space[16] : 0,
        },
        style,
      ]}
    />
  );
}

export default SarhDivider;
