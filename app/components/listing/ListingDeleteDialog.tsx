import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlText, getRtlRow } from '@/lib/rtl';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SheetModal } from '@/components/ui/SheetModal';
import { SheetSurface } from '@/components/ui/sheets/SheetSurface';
import { SarhButton } from '@/design-system/components';

type ListingDeleteDialogProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (result: { sold: boolean; reason: string }) => void;
  submitting?: boolean;
};

export function ListingDeleteDialog({
  visible,
  onClose,
  onConfirm,
  submitting,
}: ListingDeleteDialogProps) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [sold, setSold] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');

  const reset = () => {
    setSold(null);
    setReason('');
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
                onPress={() => onConfirm({ sold, reason: reason.trim() })}
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
    cancel: { alignItems: 'center', paddingVertical: spacing.sm },
    cancelText: { ...typography.bodyStrong, color: colors.textMuted },
  });
}
