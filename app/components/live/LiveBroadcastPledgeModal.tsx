import { AppIcon } from '@/components/ui/FlaticonIcon';
import { getRtlText } from '@/lib/rtl';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

type Props = {
  visible: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onConfirm: () => void;
  onClose: () => void;
  confirming?: boolean;
};

const LIVE_RULES = [
  'البث المباشر يجب أن يكون مرتبطاً بإعلان منشور في السوق.',
  'يُمنع نشر محتوى مضلل أو غير لائق أو مخالف للأنظمة.',
  'يلتزم المُذيع بالصدق في عرض المنتجات والأسعار أثناء البث.',
  'تحتفظ منصة سرح بحق إيقاف أي بث مخالف دون إشعار مسبق.',
];

export function LiveBroadcastPledgeModal({
  visible,
  checked,
  onToggleCheck,
  onConfirm,
  onClose,
  confirming = false,
}: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <AppIcon name="close" size={20} color="#fff" />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.title}>📜 تعهد البث المباشر</Text>
              <Text style={styles.subtitle}>اقرأ الشروط ووافق قبل بدء البث</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📋 شروط البث على سرح</Text>
              {LIVE_RULES.map((item, i) => (
                <Text key={i} style={styles.ruleItem}>
                  {i + 1}. {item}
                </Text>
              ))}
            </View>

            <View style={[styles.card, styles.oathCard]}>
              <Text style={styles.cardTitleBlue}>🤲 القسم بالله</Text>
              <Text style={styles.oath}>
                "أقسم بالله العظيم أن محتوى هذا البث صحيح، وأن ما أعرضه مطابق للحقيقة،
                وأتعهد بالالتزام بسياسات منصة سرح أثناء البث المباشر."
              </Text>
            </View>

            <Pressable
              onPress={onToggleCheck}
              style={[styles.checkboxRow, checked && styles.checkboxRowActive]}
            >
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={styles.checkboxText}>
                أقر بأنني قرأت شروط البث المباشر، وأتعهد بالالتزام بها، وأقسم بالله على
                صحة ما سأعرضه أثناء البث.
              </Text>
            </Pressable>
            <View style={{ height: spacing.md }} />
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={[styles.confirmBtn, (!checked || confirming) && styles.confirmBtnDisabled]}
              onPress={onConfirm}
              disabled={!checked || confirming}
            >
              <Text style={[styles.confirmText, (!checked || confirming) && styles.confirmTextMuted]}>
                {confirming ? 'جاري بدء البث...' : 'أوافق وأبدأ البث 🔴'}
              </Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>إلغاء</Text>
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
    backgroundColor: 'rgba(6,9,26,0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgDeep,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderMid,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.liveRed,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, alignItems: 'flex-end' },
  title: { ...typography.h3, color: '#fff' },
  subtitle: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  scroll: { paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  oathCard: {
    backgroundColor: '#0A1530',
    borderColor: `${colors.electric}40`,
  },
  cardTitle: { ...typography.bodyStrong, color: colors.textBrandStrong,  },
  cardTitleBlue: { ...typography.bodyStrong, color: colors.textBrand,  },
  ruleItem: { ...typography.body, color: colors.textSecondary, lineHeight: 24,  },
  oath: {
    ...typography.body,
    color: colors.textBrandStrong,
    lineHeight: 28,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  checkboxRowActive: { borderColor: colors.liveRed, backgroundColor: `${colors.liveRed}10` },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderMid,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: colors.liveRed, borderColor: colors.liveRed },
  checkmark: { ...typography.badge, color: '#fff' },
  checkboxText: {
    flex: 1,
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    ...getRtlText(),
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: colors.liveRed,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: colors.bgSurface, opacity: 0.7 },
  confirmText: { ...typography.bodyStrong, color: '#fff' },
  confirmTextMuted: { color: colors.textMuted },
  cancelBtn: {
    flex: 1,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cancelText: { ...typography.bodyStrong, color: colors.textSecondary },
});
}
