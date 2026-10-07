import { AppIcon } from '@/components/ui/FlaticonIcon';
import { SheetModal } from '@/components/ui/SheetModal';
import {
  FEE_PAYMENT_METHODS,
  PaymentBrandLogo,
} from '@/components/payment/PaymentBrandLogos';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, SarhButton, SpringPressable } from '@/design-system/components';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { getRtlDirection, getRtlRow, getRtlText } from '@/lib/rtl';
import {
  initiateListingFeePayment,
  quoteListingFee,
} from '@/services/listingFeePayment';
import { launchPaymentCheckout } from '@/services/payments';
import type { NIPaymentMethod } from '@/services/network_international';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SheetPhase = 'form' | 'success' | 'error';

type ListingFeePaymentSheetProps = {
  visible: boolean;
  listingId: string;
  listingTitle?: string;
  onClose: () => void;
};

/**
 * Sarh fee payment (1% commission) — iOS checkout-style sheet: amount summary
 * card, grouped payment-method list with the official brand marks, and a pinned
 * capsule CTA. Uses the shared SheetModal (spring up, drag down to dismiss).
 */
export function ListingFeePaymentSheet({
  visible,
  listingId,
  listingTitle,
  onClose,
}: ListingFeePaymentSheetProps) {
  const { accessToken } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));

  const [amount, setAmount] = useState('');
  const [quotedFee, setQuotedFee] = useState<number | null>(null);
  const [method, setMethod] = useState<NIPaymentMethod>('mada');
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState<SheetPhase>('form');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!visible) return;
    setPhase('form');
    setAmount('');
    setQuotedFee(null);
    setMethod('mada');
    setErrorMessage('');
    setProcessing(false);
  }, [visible]);

  const handleClose = () => {
    if (processing) return;
    onClose();
  };

  const handleAmountChange = (value: string) => {
    const digits = value.replace(/[^\d.]/g, '');
    const parts = digits.split('.');
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 2) return;
    setAmount(digits);
  };

  const handlePay = async () => {
    if (!accessToken) {
      setPhase('error');
      setErrorMessage('يجب تسجيل الدخول لإتمام الدفع');
      return;
    }

    const parsed = parseFloat(amount);
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      setPhase('error');
      setErrorMessage('أدخل مبلغاً صالحاً للسداد، أو أغلق النافذة للسداد لاحقاً.');
      return;
    }

    setProcessing(true);
    setPhase('form');
    setErrorMessage('');

    const quoted = await quoteListingFee({ listingId, saleAmount: parsed });
    if (!quoted.ok) {
      setProcessing(false);
      setPhase('error');
      setErrorMessage(quoted.message);
      return;
    }
    setQuotedFee(quoted.data.commission);

    const initiated = await initiateListingFeePayment({
      listingId,
      saleAmount: parsed,
      amount: quoted.data.commission,
      method,
      listingTitle,
    });

    if (!initiated.ok) {
      setProcessing(false);
      setPhase('error');
      setErrorMessage(initiated.message);
      return;
    }

    const outcome = await launchPaymentCheckout({
      accessToken,
      paymentId: initiated.data.paymentId,
      checkoutUrl: initiated.data.checkoutUrl,
      devMode: initiated.data.devMode,
      context: 'commission',
      returnParams: { listingId },
    });

    setProcessing(false);

    if (outcome === 'paid' || outcome === 'opened') {
      if (outcome === 'paid') {
        setPhase('success');
      } else {
        handleClose();
      }
      return;
    }

    setPhase('error');
    setErrorMessage(
      outcome === 'cancelled'
        ? 'تم إلغاء عملية الدفع. لم تُخصم أي مبالغ.'
        : 'تعذّر إتمام الدفع. حاول مرة أخرى.',
    );
  };

  const bottomPad = Math.max(insets.bottom, spacing.lg);

  return (
    <SheetModal
      visible={visible}
      onClose={handleClose}
      dismissible={!processing}
      keyboardAvoiding
      containerStyle={styles.container}
    >
      <View style={[styles.sheet, getRtlDirection()]}>
        <View style={styles.handle} />

        <View style={[styles.header, getRtlRow()]}>
          <View style={styles.headerText}>
            <AppText variant="heading2" style={getRtlText()}>
              سداد رسوم سرح
            </AppText>
            <AppText variant="bodySmall" color="textMuted" style={getRtlText()}>
              أدخل مبلغ البيع لحساب عمولة سرح 1%. السداد اختياري ولا يُفترض البيع بفتح هذه الصفحة.
            </AppText>
          </View>
          <SpringPressable
            onPress={handleClose}
            disabled={processing}
            style={styles.closeBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
          >
            <AppIcon name="close" size={18} color={colors.textSecondary} />
          </SpringPressable>
        </View>

        {phase === 'success' ? (
          <View style={[styles.resultWrap, { paddingBottom: bottomPad }]}>
            <View style={[styles.resultBadge, styles.resultBadgeSuccess]}>
              <AppIcon name="checkmark" size={34} color={colors.onElectric} />
            </View>
            <AppText variant="heading3" align="center">
              تم سداد الرسوم بنجاح، شكراً لك.
            </AppText>
            <SarhButton title="حسناً" onPress={handleClose} shape="pill" fullWidth style={styles.resultCta} />
          </View>
        ) : phase === 'error' ? (
          <View style={[styles.resultWrap, { paddingBottom: bottomPad }]}>
            <View style={[styles.resultBadge, styles.resultBadgeError]}>
              <AppIcon name="alert-circle-outline" size={34} color={colors.danger} />
            </View>
            <AppText variant="heading3" align="center">
              تعذّر إتمام الدفع
            </AppText>
            <AppText variant="bodySmall" color="textMuted" align="center">
              {errorMessage}
            </AppText>
            <SarhButton
              title="إعادة المحاولة"
              onPress={() => {
                setPhase('form');
                setErrorMessage('');
              }}
              shape="pill"
              fullWidth
              leftIcon="refresh-outline"
              style={styles.resultCta}
            />
            <SarhButton title="إغلاق" onPress={handleClose} variant="ghost" shape="pill" fullWidth />
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              {/* Amount summary */}
              <View style={styles.summaryCard}>
                <AppText variant="caption" color="textMuted" style={getRtlText()}>
                  مبلغ البيع
                </AppText>
                <View style={[styles.amountRow, getRtlRow()]}>
                  <TextInput
                    value={amount}
                    onChangeText={handleAmountChange}
                    placeholder="0.00"
                    placeholderTextColor={colors.textSubtle}
                    keyboardType="decimal-pad"
                    style={[styles.amountInput, getRtlText()]}
                    accessibilityLabel="مبلغ البيع"
                  />
                  <AppText variant="heading3" color="textSecondary">
                    ر.س
                  </AppText>
                </View>
                <View style={styles.divider} />
                <View style={[styles.breakdownRow, getRtlRow()]}>
                  <AppText variant="bodySmall" color="textSecondary">
                    عمولة سرح
                  </AppText>
                  <AppText variant="label">1%</AppText>
                </View>
                <View style={[styles.breakdownRow, getRtlRow()]}>
                  <AppText variant="bodySmall" color="textSecondary">
                    الرسوم المستحقة
                  </AppText>
                  {quotedFee != null ? (
                    <AppText variant="price">{`${quotedFee} ر.س`}</AppText>
                  ) : (
                    <AppText variant="bodySmall" color="textMuted">
                      تُحسب عند الدفع
                    </AppText>
                  )}
                </View>
              </View>

              {/* Payment methods — iOS grouped inset list */}
              <AppText variant="caption" color="textMuted" style={[styles.sectionLabel, getRtlText()]}>
                وسائل الدفع
              </AppText>
              <View style={styles.group} accessibilityRole="radiogroup">
                {FEE_PAYMENT_METHODS.map((item, index) => {
                  const active = method === item.id;
                  return (
                    <View key={item.id}>
                      {index > 0 ? <View style={styles.rowSeparator} /> : null}
                      <SpringPressable
                        onPress={() => setMethod(item.id)}
                        pressedScale={1}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active, checked: active }}
                        accessibilityLabel={item.labelAr}
                        style={({ pressed }) => [
                          styles.methodRow,
                          getRtlRow(),
                          pressed && styles.methodRowPressed,
                        ]}
                      >
                        <PaymentBrandLogo id={item.id} size={30} />
                        <View style={styles.methodText}>
                          <AppText variant="label" style={getRtlText()}>
                            {item.labelAr}
                          </AppText>
                          <AppText variant="caption" color="textMuted" style={getRtlText()}>
                            {item.hintAr}
                          </AppText>
                        </View>
                        <View style={[styles.radio, active && styles.radioActive]}>
                          {active ? (
                            <AppIcon name="checkmark" size={14} color={colors.onElectric} />
                          ) : null}
                        </View>
                      </SpringPressable>
                    </View>
                  );
                })}
              </View>

              <View style={[styles.secureNote, getRtlRow()]}>
                <AppIcon name="lock-closed-outline" size={14} color={colors.textMuted} />
                <AppText variant="caption" color="textMuted" style={getRtlText()}>
                  الدفع عبر بوابة دفع آمنة ومشفّرة
                </AppText>
              </View>
            </ScrollView>

            {/* Pinned capsule CTA */}
            <View style={[styles.footer, { paddingBottom: bottomPad }]}>
              <SarhButton
                title="ادفع الآن"
                onPress={() => void handlePay()}
                loading={processing}
                shape="pill"
                fullWidth
                leftIcon="lock-closed"
                style={styles.payBtn}
                testID="fee-pay-now"
              />
            </View>
          </>
        )}
      </View>
    </SheetModal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { maxHeight: '92%' },
    sheet: {
      backgroundColor: colors.bgSurface,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      borderWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: 0,
      borderColor: colors.borderSoft,
      paddingTop: spacing.sm,
      flexShrink: 1,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.borderMid,
      marginBottom: spacing.sm,
    },
    header: {
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      paddingBottom: spacing.md,
    },
    headerText: { flex: 1, gap: spacing.xs },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.bgField,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: { flexShrink: 1 },
    formContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      paddingBottom: spacing.lg,
      gap: spacing.sm,
    },
    summaryCard: {
      backgroundColor: colors.bgElevated,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.xs,
    },
    amountRow: {
      alignItems: 'center',
      gap: spacing.sm,
    },
    amountInput: {
      flex: 1,
      ...typography.display,
      color: colors.textPrimary,
      paddingVertical: spacing.xs,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSoft,
      marginVertical: spacing.sm,
    },
    breakdownRow: {
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 26,
    },
    sectionLabel: {
      marginTop: spacing.md,
      paddingHorizontal: spacing.xs,
    },
    group: {
      backgroundColor: colors.bgElevated,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      overflow: 'hidden',
    },
    methodRow: {
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      minHeight: 64,
    },
    methodRowPressed: { backgroundColor: colors.bgField },
    rowSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSoft,
      marginStart: spacing.lg + 47 + spacing.md,
    },
    methodText: { flex: 1, gap: 2 },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioActive: {
      backgroundColor: colors.electric,
      borderColor: colors.electric,
    },
    secureNote: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSoft,
      backgroundColor: colors.bgSurface,
    },
    payBtn: { minHeight: 52 },
    resultWrap: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      gap: spacing.md,
      alignItems: 'center',
    },
    resultBadge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    resultBadgeSuccess: { backgroundColor: colors.electric },
    resultBadgeError: { backgroundColor: colors.bgField },
    resultCta: { marginTop: spacing.sm },
  });
}
