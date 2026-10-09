import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlText, getRtlRow } from '@/lib/rtl';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SheetModal } from '@/components/ui/SheetModal';
import { SheetSurface } from '@/components/ui/sheets/SheetSurface';
import { SarhButton } from '@/design-system/components';
import { COMMISSION_REMINDER_TITLE, commissionReminderNote } from '@/lib/listingDeleteReminder';

type ListingDeleteDialogProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (result: { sold: boolean; reason: string }) => void;
  submitting?: boolean;
  /**
   * When set, choosing «تم البيع» shows a soft commission reminder before the final delete.
   * Parent decides applicability (fees enabled, not admin-managed, fee not paid).
   */
  commissionReminder?: { percent: number } | null;
  /** «سدّد الآن» — parent opens the existing ListingFeePaymentSheet. */
  onPayCommission?: () => void;
};

export function ListingDeleteDialog({
  visible,
  onClose,
  onConfirm,
  submitting,
  commissionReminder,
  onPayCommission,
}: ListingDeleteDialogProps) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [sold, setSold] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'form' | 'reminder'>('form');
  const reminderAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step !== 'reminder') return;
    reminderAnim.setValue(0);
    Animated.timing(reminderAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [step, reminderAnim]);

  useEffect(() => {
    if (!visible) {
      setSold(null);
      setReason('');
      setStep('form');
    }
  }, [visible]);

  const reset = () => {
    setSold(null);
    setReason('');
    setStep('form');
  };

  const handleConfirm = () => {
    if (sold === null) return;
    if (sold === true && commissionReminder) {
      setStep('reminder');
      return;
    }
    onConfirm({ sold, reason: reason.trim() });
  };

  const handleLater = () => {
    onConfirm({ sold: true, reason: reason.trim() });
  };

  const handlePayNow = () => {
    reset();
    onPayCommission?.();
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const canConfirm = sold !== null && reason.trim().length >= 2;

  return (
    <SheetModal visible={visible} onClose={handleClose} dismissible={!submitting} keyboardAvoiding>
      <SheetSurface style={styles.dialog}>
        {step === 'reminder' && commissionReminder ? (
          <Animated.View
            style={[
              styles.reminder,
              {
                opacity: reminderAnim,
                transform: [
                  {
                    translateY: reminderAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
                  },
                ],
              },
            ]}
          >
            <Text style={[styles.title, getRtlText()]}>{COMMISSION_REMINDER_TITLE}</Text>
            <Text style={[styles.reminderNote, getRtlText()]}>
              {commissionReminderNote(commissionReminder.percent)}
            </Text>
            <SarhButton title="سدّد الآن" onPress={handlePayNow} disabled={submitting} fullWidth />
            <SarhButton
              title="لاحقاً"
              variant="ghost"
              onPress={handleLater}
              disabled={submitting}
              fullWidth
            />
          </Animated.View>
        ) : (
        <>
          <Text style={[styles.title, getRtlText()]}>هل تم بيع هذا الإعلان؟</Text>
          <View style={[styles.choices, getRtlRow()]}>
            <Pressable
              onPress={() => setSold(true)}
              style={[styles.choice, sold === true && styles.choiceActive]}
            >
              <Text style={[styles.choiceText, getRtlText()]}>نعم، تم البيع</Text>
            </Pressable>
            <Pressable
              onPress={() => setSold(false)}
              style={[styles.choice, sold === false && styles.choiceActive]}
            >
              <Text style={[styles.choiceText, getRtlText()]}>لا، لم يتم البيع</Text>
            </Pressable>
          </View>

          {sold !== null ? (
            <>
              <Text style={[styles.label, getRtlText()]}>اذكر السبب</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="سبب الحذف"
                style={[styles.input, getRtlText()]}
                multiline
              />
              <SarhButton
                title="تأكيد حذف الإعلان"
                onPress={handleConfirm}
                disabled={!canConfirm || submitting}
                fullWidth
              />
              <Pressable onPress={handleClose} style={styles.cancel}>
                <Text style={[styles.cancelText, getRtlText()]}>إلغاء</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={handleClose} style={styles.cancel}>
              <Text style={[styles.cancelText, getRtlText()]}>إلغاء</Text>
            </Pressable>
          )}
        </>
        )}
      </SheetSurface>
    </SheetModal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    dialog: {
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    title: { ...typography.h3, color: colors.textPrimary },
    choices: { gap: spacing.sm },
    choice: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    choiceActive: { borderColor: colors.electric, backgroundColor: `${colors.electric}14` },
    choiceText: { ...typography.bodyStrong, color: colors.textPrimary },
    label: { ...typography.secondary, color: colors.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: colors.borderSoft,
      borderRadius: radius.lg,
      padding: spacing.md,
      minHeight: 80,
      color: colors.textPrimary,
      ...typography.body,
    },
    reminder: { gap: spacing.md },
    reminderNote: { ...typography.secondary, color: colors.textSecondary },
    cancel: { alignItems: 'center', paddingVertical: spacing.sm },
    cancelText: { ...typography.bodyStrong, color: colors.textMuted },
  });
}
