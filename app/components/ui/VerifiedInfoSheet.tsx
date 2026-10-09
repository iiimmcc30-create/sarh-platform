import { StyleSheet, View } from 'react-native';
import { SheetModal } from '@/components/ui/SheetModal';
import { SheetSurface } from '@/components/ui/sheets/SheetSurface';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { AppText } from '@/design-system/components';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlDirection } from '@/lib/rtl';
import { VERIFIED_SHEET_TITLE, formatVerifiedSince } from '@/lib/verifiedBadge';

/** Seal size in the sheet header. */
export const VERIFIED_SHEET_BADGE_SIZE = 44;

export type VerifiedInfoSheetProps = {
  visible: boolean;
  onClose: () => void;
  tier?: string | null;
  /** ISO approval date from the profile (`verifiedSince`); the date line hides when absent. */
  verifiedSince?: string | null;
};

/**
 * «هذا الحساب موثّق» — iOS-style bottom sheet (shared SheetModal: spring up, dim,
 * drag down to dismiss) with the seal, the title and «موثّق منذ …» when known.
 */
export function VerifiedInfoSheet({ visible, onClose, tier, verifiedSince }: VerifiedInfoSheetProps) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const since = formatVerifiedSince(verifiedSince);

  return (
    <SheetModal visible={visible} onClose={onClose} testID="verified-info-sheet">
      <SheetSurface style={styles.sheet}>
        <VerificationBadge size={VERIFIED_SHEET_BADGE_SIZE} tier={tier} />
        <AppText variant="heading3" color="textPrimary" align="center" accessibilityRole="header">
          {VERIFIED_SHEET_TITLE}
        </AppText>
        {since ? (
          <AppText variant="bodySmall" color="textSecondary" align="center" testID="verified-info-since">
            {since}
          </AppText>
        ) : null}
      </SheetSurface>
    </SheetModal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sheet: {
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
    },
  });
}

export default VerifiedInfoSheet;
