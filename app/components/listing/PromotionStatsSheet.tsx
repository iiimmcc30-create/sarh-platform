import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlDirection, getRtlRow, getRtlText } from '@/lib/rtl';
import {
  fetchPromotionStats,
  formatRemainingMs,
  type PromotionStats,
} from '@/services/listingPromotion';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type PromotionStatsSheetProps = {
  visible: boolean;
  listingId: string | null;
  listingTitle?: string;
  onClose: () => void;
};

export function PromotionStatsSheet({
  visible,
  listingId,
  listingTitle,
  onClose,
}: PromotionStatsSheetProps) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [stats, setStats] = useState<PromotionStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !listingId) return;
    setLoading(true);
    void fetchPromotionStats(listingId)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [visible, listingId]);

  const rows = [
    { key: 'impressions', label: 'مرات الظهور', value: stats?.impressions ?? 0, icon: 'eye-outline' },
    { key: 'clicks', label: 'النقرات', value: stats?.clicks ?? 0, icon: 'hand-left-outline' },
    { key: 'views', label: 'زيارات الترويج', value: stats?.promotedViews ?? 0, icon: 'trending-up-outline' },
    {
      key: 'increase',
      label: 'زيادة المشاهدات',
      value: `${stats?.viewsIncreasePercent ?? 0}%`,
      icon: 'stats-chart-outline',
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, getRtlDirection()]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.header, getRtlRow()]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, getRtlText()]}>إحصائيات الترويج</Text>
              {listingTitle ? (
                <Text style={[styles.subtitle, getRtlText()]} numberOfLines={1}>
                  {listingTitle}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <AppIcon name="close" size={22} color={styles.muted.color} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: spacing.xl }} />
          ) : (
            <>
              <View style={styles.remainingCard}>
                <Text style={styles.remainingLabel}>المدة المتبقية</Text>
                <Text style={styles.remainingValue}>
                  {stats?.isPromoted
                    ? formatRemainingMs(stats.remainingMs)
                    : 'لا يوجد ترويج نشط'}
                </Text>
              </View>

              <View style={styles.grid}>
                {rows.map((row) => (
                  <View key={row.key} style={styles.statCard}>
                    <AppIcon name={row.icon} size={20} color="#7C3AED" />
                    <Text style={styles.statValue}>{row.value}</Text>
                    <Text style={[styles.statLabel, getRtlText()]}>{row.label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.bgOverlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.bgElevated,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      gap: spacing.md,
    },
    header: {
      alignItems: 'center',
      gap: spacing.md,
    },
    title: {
      ...typography.h3,
      color: colors.textPrimary,
      ...getRtlText(),
    },
    subtitle: {
      ...typography.caption,
      color: colors.textMuted,
      ...getRtlText(),
      marginTop: 4,
    },
    muted: { color: colors.textMuted },
    remainingCard: {
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: '#7C3AED14',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#7C3AED33',
      alignItems: 'center',
      gap: 4,
    },
    remainingLabel: {
      ...typography.caption,
      color: colors.textMuted,
    },
    remainingValue: {
      ...typography.h3,
      color: '#7C3AED',
      fontWeight: '600',
    },
    grid: {
      ...getRtlRow(),
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    statCard: {
      width: '48%',
      flexGrow: 1,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      gap: 6,
    },
    statValue: {
      ...typography.h3,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    statLabel: {
      ...typography.caption,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
}
