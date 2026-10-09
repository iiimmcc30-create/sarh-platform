import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppText, SarhButton, SarhSettingsRow, SarhSettingsSection } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { fetchPayments, PAYMENT_STATUS_AR, type PaymentRecord } from '@/services/userSettings';
import { formatArabicDate } from '@/services/verification';

function amountLabel(p: PaymentRecord): string {
  const n = Number.isFinite(p.amount) ? p.amount : 0;
  return `${n.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ${p.currency === 'SAR' ? 'ر.س' : p.currency}`;
}

/** «سجل المدفوعات»: own payments / receipts (read-only). */
export default function PaymentsHistoryScreen() {
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setPayments(await fetchPayments());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="سجل المدفوعات" showBack />
      <ScreenBody gutter={false} padBottom="xxxl">
        {loading && !payments ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : !payments ? (
          <View style={styles.center}>
            <AppText variant="body" color="textMuted" align="center">
              تعذّر تحميل المدفوعات
            </AppText>
            <SarhButton title="إعادة المحاولة" variant="secondary" onPress={() => void load()} />
          </View>
        ) : payments.length === 0 ? (
          <View style={styles.center}>
            <AppText variant="body" color="textMuted" align="center">
              لا توجد مدفوعات بعد
            </AppText>
          </View>
        ) : (
          <SarhSettingsSection grouped footer="رقم الطلب يفيد الدعم عند الاستفسار عن أي عملية.">
            {payments.map((p, i) => (
              <SarhSettingsRow
                key={p.id}
                icon="receipt-outline"
                title={p.descriptionAr || p.description || 'عملية دفع'}
                subtitle={`${formatArabicDate(p.paidAt ?? p.createdAt)} · ${PAYMENT_STATUS_AR[p.status] ?? p.status} · ${p.orderId}`}
                value={amountLabel(p)}
                showDivider={i < payments.length - 1}
              />
            ))}
          </SarhSettingsSection>
        )}
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingTop: 64, paddingHorizontal: 24, gap: 16, alignItems: 'center' },
});
