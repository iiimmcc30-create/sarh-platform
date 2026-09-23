// SAFAT — Rating Modal
// Lets a viewer rate another user's account 1–5 stars. One rating per
// reviewer; calling again edits the existing rating. Average + count
// update immediately on submit.
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SarhButton } from '@/design-system/components';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';

interface RatingModalProps {
  visible: boolean;
  onClose: () => void;
  targetName: string;
  currentRating: number | null;
  currentCount: number;
  myRating: number | null;
  onSubmit: (rating: number) => Promise<boolean>;
}

const STAR_LABELS = ['ضعيف', 'مقبول', 'جيد', 'جيد جداً', 'ممتاز'];

export function RatingModal({
  visible,
  onClose,
  targetName,
  currentRating,
  currentCount,
  myRating,
  onSubmit,
}: RatingModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [selected, setSelected] = useState(myRating ?? 0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) setSelected(myRating ?? 0);
  }, [visible, myRating]);

  const handleSubmit = async () => {
    if (selected < 1) return;
    setSubmitting(true);
    const ok = await onSubmit(selected);
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          <Text style={styles.title}>
            {myRating ? 'تعديل تقييمك' : 'تقييم الحساب'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {targetName}
          </Text>

          {currentCount > 0 ? (
            <View style={styles.currentRow}>
              <AppIcon name="star" size={14} color={colors.gold} />
              <Text style={styles.currentText}>
                {currentRating?.toFixed(1)} · {currentCount.toLocaleString('ar-SA')} تقييم
              </Text>
            </View>
          ) : (
            <Text style={styles.currentText}>لا توجد تقييمات بعد — كن أول من يقيّم</Text>
          )}

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setSelected(n)} hitSlop={8}>
                <AppIcon
                  name={n <= selected ? 'star' : 'star-outline'}
                  size={36}
                  color={n <= selected ? colors.gold : colors.textSubtle}
                />
              </Pressable>
            ))}
          </View>

          <Text style={styles.starLabel}>
            {selected > 0 ? STAR_LABELS[selected - 1] : 'اختر تقييمك'}
          </Text>

          <SarhButton
            title={myRating ? 'تحديث التقييم' : 'إرسال التقييم'}
            fullWidth
            loading={submitting}
            disabled={selected < 1}
            onPress={handleSubmit}
          />

          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>إلغاء</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.bgSurface,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl,
      alignItems: 'center',
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderMid,
      marginBottom: spacing.lg,
    },
    title: {
      ...typography.h3,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    subtitle: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: 2,
    },
    currentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: spacing.md,
    },
    currentText: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: spacing.md,
    },
    starsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xl,
    },
    starLabel: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: spacing.md,
    },
    submitBtn: {
      width: '100%',
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: colors.electric,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.xl,
    },
    submitBtnDisabled: {
      opacity: 0.5,
    },
    submitText: {
      ...typography.bodyStrong,
      color: '#fff',
    },
    cancelBtn: {
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
    },
    cancelText: {
      ...typography.caption,
      color: colors.textMuted,
    },
  });
}

export default RatingModal;
