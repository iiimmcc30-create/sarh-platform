import { ListingFeePaymentSheet } from '@/components/listing/ListingFeePaymentSheet';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppText } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius, type ThemeColors } from '@/constants/theme';

type FeeRow = {
  id: string;
  listingId: string;
  commission: number;
  status: string;
  listing: { arabicTitle: string } | null;
};

export default function FeesScreen() {
  const { accessToken } = useAuth();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [payListingId, setPayListingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const res = await authFetch(`${API_BASE}/api/fees`);
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success) {
      setFees((json.data?.fees ?? []) as FeeRow[]);
    }
    setLoaded(true);
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="سداد الرسوم" showBack />
      <ScreenBody padTop="lg" padBottom="xxxl" gap="md" width="content">
        <AppText variant="bodySmall" color="textSecondary">
          السداد اختياري. أدخل مبلغ البيع عند السداد لحساب عمولة 1%. فتح الصفحة لا يعني حدوث بيع.
        </AppText>
        {loaded && fees.length === 0 ? (
          <Stack gap="sm" align="center" style={styles.empty}>
            <AppText variant="heading3" align="center">
              لا توجد رسوم مستحقة
            </AppText>
            <AppText variant="caption" color="textMuted" align="center">
              ستظهر هنا عمولات الإعلانات عند تسجيل عملية بيع.
            </AppText>
          </Stack>
        ) : null}
        {fees.map((fee) => (
          <View key={fee.id} style={styles.card}>
            <AppText variant="label" numberOfLines={2}>
              {fee.listing?.arabicTitle ?? fee.listingId}
            </AppText>
            <AppText variant="caption" color="textMuted">
              الحالة: {fee.status} — الالتزام الحالي: {fee.commission} ر.س
            </AppText>
            {fee.status !== 'paid' ? (
              <Pressable
                onPress={() => setPayListingId(fee.listingId)}
                style={styles.payLink}
                accessibilityRole="button"
                accessibilityLabel="سداد الرسوم"
              >
                <AppText variant="label" color="primary">
                  سداد الرسوم
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ))}
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
    empty: { paddingVertical: 32 },
    card: {
      backgroundColor: colors.bgElevated,
      borderRadius: radius.lg,
      padding: 16,
      gap: 8,
    },
    payLink: { alignSelf: 'flex-start' },
  });
}
