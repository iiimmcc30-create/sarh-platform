import { AppIcon } from '@/components/ui/FlaticonIcon';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { getRtlText, getRtlDirection, getRtlRow } from '@/lib/rtl';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SarhButton } from '@/design-system/components';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type SarhListingCovenantModalProps = {
  visible: boolean;
  onAccept: () => void;
  onClose: () => void;
};

export function SarhListingCovenantModal({
  visible,
  onAccept,
  onClose,
}: SarhListingCovenantModalProps) {
  const router = useRouter();
  const { colors, gradients } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (visible) setChecked(false);
  }, [visible]);

  const handleClose = () => {
    setChecked(false);
    onClose();
  };

  const handleAccept = () => {
    if (!checked) return;
    setChecked(false);
    onAccept();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={[styles.dialog, getRtlDirection()]}>
          <LinearGradient colors={gradients.electric} style={styles.header}>
            <Pressable
              onPress={handleClose}
              style={styles.closeBtn}
              accessibilityLabel="إغلاق"
              hitSlop={10}
            >
              <AppIcon name="close" size={20} color="#fff" />
            </Pressable>
            <Text style={styles.headerTitle}>معاهدة سرح</Text>
          </LinearGradient>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            bounces={false}
          >
            <View style={styles.feeBadge}>
              <AppIcon name="receipt-outline" size={18} color={colors.textBrandStrong} />
              <Text style={[styles.feeBadgeText, getRtlText()]}>
                الرسوم: 1% من قيمة البيع — السداد خلال 14 يوماً من إتمام البيع
              </Text>
            </View>

            <View style={styles.oathCard}>
              <Text style={[styles.oathText, getRtlText()]}>
                أقسم بالله العظيم أن عمولة الإعلان المستحقة لمنصة{' '}
                <Text style={styles.brand}>سرح</Text> هي{' '}
                <Text style={styles.emphasis}>1% من قيمة البيع النهائي</Text>، وأنني عند
                إتمام بيع هذا الإعلان خارج المنصة سألتزم بسداد العمولة خلال مدة أقصاها{' '}
                <Text style={styles.emphasis}>14 يوماً من تاريخ إتمام البيع</Text>. البيع
                يتم خارج سرح ولا تستلم المنصة قيمة البيع. عدم السداد لا يبرئ ذمتي من
                العمولة، وتبقى في ذمتي حتى يتم سدادها.
              </Text>
            </View>

            <Pressable
              onPress={() => setChecked((v) => !v)}
              style={[styles.checkboxRow, getRtlRow(), checked && styles.checkboxRowActive]}
            >
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked ? <AppIcon name="checkmark" size={14} color="#fff" /> : null}
              </View>
              <Text style={[styles.checkboxText, getRtlText()]}>
                إنني أوافق بما ورد أعلاه، كما أتعهد بالالتزام بـ{' '}
                <Text
                  style={styles.link}
                  onPress={() => router.push('/info/terms' as never)}
                >
                  شروط الاستخدام
                </Text>{' '}
                و{' '}
                <Text
                  style={styles.link}
                  onPress={() => router.push('/info/privacy' as never)}
                >
                  سياسة الخصوصية
                </Text>
                .
              </Text>
            </Pressable>
          </ScrollView>

          <View style={styles.footer}>
            <SarhButton
              title="إضافة الإعلان"
              onPress={handleAccept}
              disabled={!checked}
              fullWidth
              leftIcon="add-circle-outline"
            />
            <Pressable onPress={handleClose} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, getRtlText()]}>إلغاء</Text>
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
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
    },
    dialog: {
      backgroundColor: colors.bgElevated,
      borderRadius: radius.xxl,
      overflow: 'hidden',
      maxHeight: '90%',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.18,
      shadowRadius: 24,
      elevation: 12,
    },
    header: {
      ...getRtlRow(),
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      ...typography.h3,
      color: '#fff',
      flex: 1,
      ...getRtlText(),
      ...getRtlText(),
    },
    scrollContent: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    feeBadge: {
      ...getRtlRow(),
      alignItems: 'center',
      gap: spacing.sm,
      alignSelf: 'flex-end',
      backgroundColor: `${colors.electric}14`,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${colors.electric}30`,
    },
    feeBadgeText: {
      ...typography.badge,
      color: colors.textBrandStrong,
    },
    oathCard: {
      backgroundColor: colors.bgSurface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      padding: spacing.lg,
    },
    oathText: {
      ...typography.body,
      color: colors.textPrimary,
    },
    brand: {
      fontWeight: '600',
      color: colors.textBrandStrong,
    },
    emphasis: {
      fontWeight: '600',
      color: colors.textBrandStrong,
    },
    checkboxRow: {
      alignItems: 'flex-start',
      gap: spacing.md,
      backgroundColor: colors.bgSurface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: spacing.md,
    },
    checkboxRowActive: {
      borderColor: colors.electric,
      backgroundColor: `${colors.electric}10`,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: colors.borderMid,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    checkboxChecked: {
      backgroundColor: colors.electric,
      borderColor: colors.electric,
    },
    checkboxText: {
      flex: 1,
      ...typography.secondary,
      color: colors.textSecondary,
    },
    link: {
      color: colors.textBrandStrong,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    footer: {
      padding: spacing.lg,
      gap: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSoft,
    },
    cancelBtn: {
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    cancelText: {
      ...typography.bodyStrong,
      color: colors.textMuted,
    },
  });
}
