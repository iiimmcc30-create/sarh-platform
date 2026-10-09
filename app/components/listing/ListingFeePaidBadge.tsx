import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText } from '@/design-system/components';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { LISTING_FEE_PAID_LABEL } from '@/lib/listingFeeState';
import { StyleSheet, View } from 'react-native';

/** Small «الرسوم مسددة ✓» state shown to the owner instead of the «سداد الرسوم» button. */
export function ListingFeePaidBadge() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  return (
    <View
      style={[styles.badge, getRtlRow()]}
      accessibilityRole="text"
      accessibilityLabel={LISTING_FEE_PAID_LABEL}
      testID="listing-fee-paid"
    >
      <AppIcon name="checkmark-circle" size={16} color={colors.success} />
      <AppText variant="caption" color="textSecondary">
        {LISTING_FEE_PAID_LABEL}
      </AppText>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    badge: {
      alignSelf: 'center',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: `${colors.success}14`,
    },
  });
}
