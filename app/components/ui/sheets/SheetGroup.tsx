import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { SHEET_GROUP_RADIUS, SHEET_GUTTER } from './sheetLayout';

/** Rounded group of sheet rows (iOS action-sheet card). */
export function SheetGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        styles.group,
        {
          backgroundColor: isDark ? colors.bgElevated : colors.bgDeep,
          borderColor: colors.borderSoft,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginHorizontal: SHEET_GUTTER,
    borderRadius: SHEET_GROUP_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});

export default SheetGroup;
