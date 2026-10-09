import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/design-system/components';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow } from '@/lib/rtl';
import { SHEET_ROW_HEIGHT } from './sheetLayout';

export type SheetRowProps = {
  label: string;
  subtitle?: string;
  icon?: string;
  /** Picker mode: show a checkmark when selected. */
  selected?: boolean;
  destructive?: boolean;
  /** Cancel row: centered, semibold. */
  cancel?: boolean;
  showDivider?: boolean;
  onPress: () => void;
  testID?: string;
};

/**
 * One 54pt sheet row: optional light icon on the start (right in RTL), right-aligned
 * label, checkmark on the end for the selected picker option, muted red when
 * destructive, hairline divider inset under the text.
 */
export function SheetRow({
  label,
  subtitle,
  icon,
  selected = false,
  destructive = false,
  cancel = false,
  showDivider = false,
  onPress,
  testID,
}: SheetRowProps) {
  const { colors } = useTheme();
  const tint = destructive ? colors.danger : colors.textPrimary;
  return (
    <View>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          getRtlRow(),
          cancel && styles.rowCancel,
          pressed && { backgroundColor: colors.bgElevated },
        ]}
      >
        {icon && !cancel ? <AppIcon name={icon} size={20} color={destructive ? colors.danger : colors.textSecondary} /> : null}
        <View style={cancel ? styles.textCancel : styles.text}>
          <AppText
            variant={cancel || selected ? 'label' : 'body'}
            numberOfLines={2}
            align={cancel ? 'center' : undefined}
            style={{ color: tint }}
          >
            {label}
          </AppText>
          {subtitle && !cancel ? (
            <AppText variant="caption" color="textMuted" numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {selected && !cancel ? (
          <AppIcon name="checkmark" size={20} color={colors.textPrimary} />
        ) : null}
      </Pressable>
      {showDivider ? (
        <View style={[styles.divider, { backgroundColor: colors.borderSoft }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: SHEET_ROW_HEIGHT,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 12,
  },
  rowCancel: { justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  textCancel: { flex: 1, alignItems: 'center' },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
});

export default SheetRow;
