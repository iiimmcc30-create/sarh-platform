import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { SettingsGroup, SettingsHero, SettingsPill, SettingsStatus } from '@/components/settings/SettingsRows';
import { SarhSettingsRow } from '@/design-system/components';
import {
  formatPaymentAmount,
  groupPaymentsByMonth,
  paymentStatusTone,
  paymentTitle,
  paymentType,
  rememberPayments,
} from '@/lib/paymentHistory';
import { safePush } from '@/lib/safeNavigate';
import { fetchPayments, PAYMENT_STATUS_AR, type PaymentRecord } from '@/services/userSettings';
import { formatArabicDate } from '@/services/verification';

/** «سجل المدفوعات»: transactions grouped by month; tap one for its receipt details. */
export default function PaymentsHistoryScreen() {
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchPayments();
    if (list) rememberPayments(list);
    setPayments(list);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const groups = payments ? groupPaymentsByMonth(payments) : [];

  return (
    <SettingsScreen title="سجل المدفوعات">
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
        <SettingsHero
          icon="receipt-outline"
          title="لا توجد مدفوعات بعد"
          body="ستظهر هنا عمليات الدفع التي تجريها في سرح، مثل الاشتراكات وتمييز الإعلانات، مع إيصال لكل عملية."
        />
      ) : (
        groups.map((group, gi) => (
          <SettingsGroup
            key={group.key}
            title={group.label}
            footer={gi === groups.length - 1 ? 'اضغط على أي عملية لعرض تفاصيلها ورقم الطلب.' : undefined}
          >
            {group.items.map((p, i) => (
              <SarhSettingsRow
                key={p.id}
                testID={`payment-${p.id}`}
                icon={paymentType(p).icon}
                iconTile
                title={paymentTitle(p)}
                subtitle={formatArabicDate(p.paidAt ?? p.createdAt)}
                value={formatPaymentAmount(p)}
                accessory={
                  <SettingsPill label={PAYMENT_STATUS_AR[p.status] ?? p.status} tone={paymentStatusTone(p.status)} />
                }
                showDivider={i < group.items.length - 1}
                onPress={() => safePush(`/settings/payment?id=${encodeURIComponent(p.id)}`, undefined, router)}
              />
            ))}
          </SettingsGroup>
        ))
      )}
    </SettingsScreen>
  );
}
