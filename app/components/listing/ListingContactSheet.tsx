import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/design-system/components';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow } from '@/lib/rtl';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ListingContactSheetProps = {
  visible: boolean;
  onClose: () => void;
  onMessage: () => void;
  onCall: () => void;
  canCall: boolean;
  allowMessage?: boolean;
};

/**
 * Bottom sheet for listing contact — reuses the same RN Modal + sheet pattern
 * as RatingModal / ListingFeePaymentSheet (no new modal system).
 */
export function ListingContactSheet({
  visible,
  onClose,
  onMessage,
  onCall,
  canCall,
  allowMessage = true,
}: ListingContactSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.handle} />

          <View style={[styles.header, getRtlRow()]}>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="إغلاق"
            >
              <AppIcon name="close" size={20} color={colors.textMuted} />
            </Pressable>
            <AppText variant="heading3" style={styles.title} numberOfLines={1}>
              تواصل مع المعلن
            </AppText>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.actions}>
            {allowMessage ? (
            <Pressable
              onPress={() => {
                onClose();
                onMessage();
              }}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
              accessibilityRole="button"
              accessibilityLabel="مراسلة"
            >
              <View style={[styles.actionInner, getRtlRow()]}>
                <View style={styles.iconWrap}>
                  <AppIcon name="chatbubbles-outline" size={22} color={colors.electricBright} />
                </View>
                <AppText variant="label" style={styles.actionLabel}>
                  مراسلة
                </AppText>
              </View>
            </Pressable>
            ) : null}

            <Pressable
              onPress={() => {
                if (!canCall) return;
                onClose();
                onCall();
              }}
              disabled={!canCall}
              style={({ pressed }) => [
                styles.actionBtn,
                !canCall && styles.actionDisabled,
                pressed && canCall && styles.actionPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="اتصل"
              accessibilityState={{ disabled: !canCall }}
            >
              <View style={[styles.actionInner, getRtlRow()]}>
                <View style={styles.iconWrap}>
                  <AppIcon
                    name="call-outline"
                    size={22}
                    color={canCall ? colors.electricBright : colors.textMuted}
                  />
                </View>
                <AppText
                  variant="label"
                  style={[styles.actionLabel, !canCall && styles.actionLabelDisabled]}
                >
                  اتصل
                </AppText>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.bgOverlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.bgSurface,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderMid,
      marginBottom: spacing.md,
    },
    header: {
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
      minHeight: 40,
    },
    closeBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerSpacer: {
      width: 40,
      height: 40,
    },
    title: {
      flex: 1,
      textAlign: 'center',
      color: colors.textPrimary,
    },
    actions: {
      gap: spacing.sm,
      paddingBottom: spacing.sm,
    },
    actionBtn: {
      minHeight: 52,
      borderRadius: radius.lg,
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      paddingHorizontal: spacing.md,
      justifyContent: 'center',
    },
    actionPressed: {
      opacity: 0.88,
    },
    actionDisabled: {
      opacity: 0.45,
    },
    actionInner: {
      alignItems: 'center',
      gap: spacing.md,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgField,
    },
    actionLabel: {
      flex: 1,
      color: colors.textPrimary,
    },
    actionLabelDisabled: {
      color: colors.textMuted,
    },
  });
}

export default ListingContactSheet;
