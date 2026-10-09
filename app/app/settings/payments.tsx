import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { SettingsGroup, SettingsStatus } from '@/components/settings/SettingsRows';
import { SarhSettingsRow } from '@/design-system/components';
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
    <SettingsScreen title="سجل المدفوعات" largeTitle>
      {loading && !payments ? (
        <SettingsStatus state="loading" />
      ) : !payments ? (
        <SettingsStatus
          state="error"
          icon="receipt-outline"
          message="تعذّر تحميل المدفوعات"
          onRetry={() => void load()}
        />
      ) : payments.length === 0 ? (
        <SettingsStatus state="empty" icon="receipt-outline" message="لا توجد مدفوعات بعد" />
      ) : (
        <SettingsGroup
          title={`العمليات · ${payments.length}`}
          footer="رقم الطلب يفيد الدعم عند الاستفسار عن أي عملية."
        >
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
        </SettingsGroup>
      )}
    </SettingsScreen>
  );
}
