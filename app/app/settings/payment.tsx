import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { SettingsGroup, SettingsPill, SettingsStatus } from '@/components/settings/SettingsRows';
import { AppText, SarhSettingsRow } from '@/design-system/components';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { useTheme } from '@/hooks/useTheme';
import { copyToClipboard } from '@/lib/clipboard';
import {
  PAYMENT_METHOD_AR,
  findRememberedPayment,
  formatPaymentAmount,
  formatPaymentDateTime,
  paymentStatusTone,
  paymentTitle,
  paymentType,
  rememberPayments,
} from '@/lib/paymentHistory';
import { showToast } from '@/lib/toast';
import { fetchPayments, PAYMENT_STATUS_AR, type PaymentRecord } from '@/services/userSettings';

/** Receipt view for one transaction from «سجل المدفوعات» (read-only). */
export default function PaymentDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [payment, setPayment] = useState<PaymentRecord | null | undefined>(() =>
    id ? findRememberedPayment(String(id)) : null,
  );
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    if (findRememberedPayment(String(id))) return;
    setFailed(false);
    const list = await fetchPayments();
    if (!list) {
      setFailed(true);
      return;
    }
    rememberPayments(list);
    setPayment(list.find((p) => p.id === String(id)) ?? null);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const copyOrder = (orderId: string) => {
    copyToClipboard(orderId);
    void showToast('تم نسخ رقم الطلب', 'success');
  };

  return (
    <SettingsScreen title="تفاصيل العملية">
      {failed ? (
        <SettingsStatus state="error" icon="receipt-outline" message="تعذّر تحميل العملية" onRetry={() => void load()} />
      ) : payment === undefined ? (
        <SettingsStatus state="loading" />
      ) : payment === null ? (
        <SettingsStatus state="empty" icon="receipt-outline" message="لم نجد هذه العملية" />
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: 8, paddingTop: 16, paddingHorizontal: 32 }}>
            <View
              style={{
                width: 56,
                height: 56,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppIcon name={paymentType(payment).icon} size={32} strokeWidth={1.5} color={colors.textPrimary} />
            </View>
            <AppText variant="heading1" color="textPrimary" align="center">
              {formatPaymentAmount(payment)}
            </AppText>
            <AppText variant="bodySmall" color="textMuted" align="center" numberOfLines={2}>
              {paymentTitle(payment)}
            </AppText>
            <SettingsPill
              label={PAYMENT_STATUS_AR[payment.status] ?? payment.status}
              tone={paymentStatusTone(payment.status)}
            />
          </View>

          <SettingsGroup title="التفاصيل">
            <SarhSettingsRow title="النوع" value={paymentType(payment).label} />
            <SarhSettingsRow
              title="طريقة الدفع"
              value={PAYMENT_METHOD_AR[payment.method] ?? payment.method}
            />
            <SarhSettingsRow title="تاريخ الإنشاء" value={formatPaymentDateTime(payment.createdAt)} />
            <SarhSettingsRow
              title="تاريخ الدفع"
              value={payment.paidAt ? formatPaymentDateTime(payment.paidAt) : '—'}
              showDivider={false}
            />
          </SettingsGroup>

          <SettingsGroup footer="اضغط لنسخ رقم الطلب، وأرسله للدعم عند الاستفسار عن هذه العملية.">
            <SarhSettingsRow
              title="رقم الطلب"
              value={payment.orderId}
              valueLtr
              showDivider={false}
              onPress={() => copyOrder(payment.orderId)}
            />
          </SettingsGroup>
        </>
      )}
    </SettingsScreen>
  );
}
