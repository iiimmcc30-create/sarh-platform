import { ListingFeePaymentSheet } from '@/components/listing/ListingFeePaymentSheet';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText, SarhButton } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { radius, type ThemeColors } from '@/constants/theme';
import { visibleFees, type FeeListRow as FeeRow } from '@/lib/listingFeeState';

/** Display-only labels; legacy `overdue` reads like any open (optional) commission. */
const FEE_STATUS_LABEL: Record<string, string> = {
  pending: 'بانتظار السداد (اختياري)',
  overdue: 'بانتظار السداد (اختياري)',
  paid: 'مدفوعة',
};

export default function FeesScreen() {
  const { accessToken } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [payListingId, setPayListingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const res = await authFetch(`${API_BASE}/api/fees`);
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success) {
      setFees(visibleFees((json.data?.fees ?? []) as FeeRow[]));
    }
    setLoaded(true);
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const owed = fees.filter((fee) => fee.status !== 'paid');
  const owedTotal =
    Math.round(owed.reduce((sum, fee) => sum + (Number(fee.commission) || 0), 0) * 100) / 100;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="سداد الرسوم" showBack />
      <ScreenBody padTop="lg" padBottom="xxxl" gap="lg" width="content">
        {owed.length > 0 && owedTotal > 0 ? (
          <View style={styles.summaryCard}>
            <AppText variant="caption" color="textMuted">
              عمولة ما بعته (اختيارية)
            </AppText>
            <Row gap="xs" align="end">
              <AppText variant="display">{owedTotal}</AppText>
              <AppText variant="label" color="textSecondary" style={styles.currency}>
                ر.س
              </AppText>
            </Row>
            <AppText variant="caption" color="textMuted">
              {`${owed.length} من إعلاناتك المبيعة`}
            </AppText>
          </View>
        ) : null}

        <Row gap="sm" align="start" style={styles.note}>
          <AppIcon name="information-circle-outline" size={16} color={colors.textMuted} />
          <AppText variant="caption" color="textMuted" style={styles.noteText}>
            العمولة 1% من مبلغ البيع، وتُدفع فقط إذا بعت عبر سرح. السداد اختياري وعلى الأمانة.
          </AppText>
        </Row>

        {loaded && fees.length === 0 ? (
          <Stack gap="sm" align="center" style={styles.empty}>
            <View style={styles.emptyIcon}>
              <AppIcon name="receipt-outline" size={28} color={colors.textSecondary} />
            </View>
            <AppText variant="heading3" align="center">
              ما عليك رسوم مستحقة
            </AppText>
            <AppText variant="caption" color="textMuted" align="center">
              العمولة تُدفع فقط إذا بعت. إذا بعت عبر سرح يمكنك سدادها من صفحة الإعلان متى شئت.
            </AppText>
          </Stack>
        ) : null}

        {fees.length > 0 ? (
          <View style={styles.group}>
            {fees.map((fee, index) => {
              const paid = fee.status === 'paid';
              return (
                <View key={fee.id}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <Row gap="md" align="center" style={styles.feeRow}>
                    <View style={styles.feeIcon}>
                      <AppIcon
                        name={paid ? 'checkmark' : 'receipt-outline'}
                        size={18}
                        color={colors.textSecondary}
                      />
                    </View>
                    <Stack gap="xs" fill>
                      <AppText variant="label" numberOfLines={2}>
                        {fee.listing?.arabicTitle ?? fee.listingId}
                      </AppText>
                      <Row gap="xs" wrap>
                        <View style={styles.statusPill}>
                          <AppText variant="micro" color="textSecondary">
                            {FEE_STATUS_LABEL[fee.status] ?? fee.status}
                          </AppText>
                        </View>
                        <AppText variant="caption" color="textMuted">
                          {fee.commission != null
                            ? `العمولة: ${fee.commission} ر.س`
                            : 'أدخل مبلغ البيع لحساب العمولة'}
                        </AppText>
                      </Row>
                    </Stack>
                    {!paid ? (
                      <SarhButton
                        title="سداد"
                        size="sm"
                        shape="pill"
                        onPress={() => setPayListingId(fee.listingId)}
                        accessibilityLabel="سداد الرسوم"
                      />
                    ) : null}
                  </Row>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScreenBody>
      {payListingId ? (
        <ListingFeePaymentSheet
          visible
          listingId={payListingId}
          onClose={() => {
            setPayListingId(null);
            void load();
          }}
        />
      ) : null}
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    summaryCard: {
      backgroundColor: colors.bgElevated,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      paddingHorizontal: 16,
      paddingVertical: 16,
      gap: 4,
    },
    currency: { paddingBottom: 6 },
    note: { paddingHorizontal: 4 },
    noteText: { flex: 1 },
    empty: { paddingVertical: 32 },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.bgField,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    group: {
      backgroundColor: colors.bgElevated,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      overflow: 'hidden',
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSoft,
      marginStart: 16 + 36 + 12,
    },
    feeRow: {
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    feeIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.bgField,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusPill: {
      backgroundColor: colors.bgField,
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
  });
}
