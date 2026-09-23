import { AppIcon } from '@/components/ui/FlaticonIcon';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import {
  FEE_PAYMENT_METHODS,
  PaymentBrandLogo,
} from '@/components/payment/PaymentBrandLogos';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { motion } from '@/design-system';
import { useAuth } from '@/contexts/AuthContext';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow, getRtlDirection, getRtlText } from '@/lib/rtl';
import {
  initiateListingFeePayment,
  quoteListingFee,
} from '@/services/listingFeePayment';
import { launchPaymentCheckout } from '@/services/payments';
import type { NIPaymentMethod } from '@/services/network_international';
import { useEffect, useRef, useState } from 'react';
import { SarhButton } from '@/design-system/components';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type SheetPhase = 'form' | 'success' | 'error';

type ListingFeePaymentSheetProps = {
  visible: boolean;
  listingId: string;
  listingTitle?: string;
  onClose: () => void;
};

export function ListingFeePaymentSheet({
  visible,
  listingId,
  listingTitle,
  onClose,
}: ListingFeePaymentSheetProps) {
  const { accessToken } = useAuth();
  const { colors, gradients } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));

  const [amount, setAmount] = useState('');
  const [quotedFee, setQuotedFee] = useState<number | null>(null);
  const [method, setMethod] = useState<NIPaymentMethod>('mada');
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState<SheetPhase>('form');
  const [errorMessage, setErrorMessage] = useState('');
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    setPhase('form');
    setAmount('');
    setQuotedFee(null);
    setMethod('mada');
    setErrorMessage('');
    setProcessing(false);
  }, [visible]);

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(0);
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        ...motion.spring.sheet,
      }).start();
    }
  }, [visible, slideAnim]);

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

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [420, 0],
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <Animated.View
          style={[
            styles.sheet, getRtlDirection(),
            { transform: [{ translateY }] },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          <View style={[styles.header, getRtlRow()]}>
            <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={8}>
              <AppIcon name="close" size={20} color={colors.textMuted} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={[styles.title, getRtlText()]}>سداد رسوم سرح</Text>
              <Text style={[styles.subtitle, getRtlText()]}>
                أدخل مبلغ البيع لحساب عمولة سرح 1%. السداد اختياري ولا يُفترض البيع بفتح هذه الصفحة.
              </Text>
            </View>
            <View style={styles.headerIcon}>
              <AppIcon name="receipt-outline" size={22} color={colors.textBrandStrong} />
            </View>
          </View>

          {phase === 'success' ? (
            <View style={styles.resultWrap}>
              <View style={styles.successIcon}>
                <AppIcon name="checkmark-circle" size={56} color={colors.emerald} />
              </View>
              <Text style={[styles.resultTitle, getRtlText()]}>
                تم سداد الرسوم بنجاح، شكراً لك.
              </Text>
              <SarhButton title="حسناً" onPress={handleClose} fullWidth />
            </View>
          ) : phase === 'error' ? (
            <View style={styles.resultWrap}>
              <View style={styles.errorIcon}>
                <AppIcon name="alert-circle-outline" size={52} color={colors.danger} />
              </View>
              <Text style={[styles.resultTitle, getRtlText()]}>تعذّر إتمام الدفع</Text>
              <Text style={[styles.errorBody, getRtlText()]}>{errorMessage}</Text>
              <SarhButton
                title="إعادة المحاولة"
                onPress={() => {
                  setPhase('form');
                  setErrorMessage('');
                }}
                fullWidth
                leftIcon="refresh-outline"
              />
              <Pressable onPress={handleClose} style={styles.cancelBtn}>
                <Text style={[styles.cancelText, getRtlText()]}>إغلاق</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.fieldBlock}>
                <Text style={[styles.fieldLabel, getRtlText()]}>مبلغ البيع</Text>
                <View style={[styles.amountRow, getRtlRow()]}>
                  <Text style={styles.currencyTag}>ر.س</Text>
                  <TextInput
                    value={amount}
                    onChangeText={handleAmountChange}
                    placeholder="0.00"
                    placeholderTextColor={colors.textSubtle}
                    keyboardType="decimal-pad"
                    style={[styles.amountInput, getRtlText()]}
                  />
                </View>
                <Text style={[styles.fieldHint, getRtlText()]}>
                  عمولة سرح: 1%
                  {quotedFee != null ? ` — الرسوم: ${quotedFee} ر.س` : ''}
                </Text>
              </View>

              <Text style={[styles.sectionLabel, getRtlText()]}>وسائل الدفع</Text>
              <View style={styles.methodsGrid}>
                {FEE_PAYMENT_METHODS.map((item) => {
                  const active = method === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setMethod(item.id)}
                      style={[styles.methodCard, active && styles.methodCardActive]}
                    >
                      <PaymentBrandLogo id={item.id} size={28} />
                      <Text
                        style={[
                          styles.methodLabel, getRtlText(),
                          active && styles.methodLabelActive,
                        ]}
                      >
                        {item.labelAr}
                      </Text>
                      {active ? (
                        <View style={styles.methodCheck}>
                          <AppIcon name="checkmark" size={12} color="#fff" />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <LinearGradient colors={gradients.electric} style={styles.payBtnWrap}>
                <Pressable
                  onPress={() => void handlePay()}
                  disabled={processing}
                  style={({ pressed }) => [
                    styles.payBtn,
                    pressed && styles.payBtnPressed,
                  ]}
                >
                  {processing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <AppIcon name="card-outline" size={20} color="#fff" />
                      <Text style={styles.payBtnText}>ادفع الآن</Text>
                    </>
                  )}
                </Pressable>
              </LinearGradient>
            </ScrollView>
          )}
        </Animated.View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.bgOverlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.bgElevated,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      maxHeight: '92%',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 16,
    },
    handleWrap: { alignItems: 'center', paddingTop: spacing.sm },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderMid,
    },
    header: {
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSoft,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 16,
      backgroundColor: colors.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: { flex: 1 },
    headerIcon: {
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: `${colors.electric}16`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      ...typography.sectionHeading,
      color: colors.textPrimary,
    },
    subtitle: {
      ...typography.body,
      color: colors.textMuted,
      marginTop: 4,
      lineHeight: 22,
    },
    formContent: {
      padding: spacing.lg,
      gap: spacing.lg,
      paddingBottom: spacing.xxxl,
    },
    fieldBlock: { gap: spacing.sm },
    fieldLabel: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
    },
    amountRow: {
      alignItems: 'center',
      backgroundColor: colors.bgSurface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      paddingHorizontal: spacing.md,
    },
    currencyTag: {
      ...typography.bodyStrong,
      color: colors.textBrandStrong,
      paddingHorizontal: spacing.sm,
    },
    amountInput: {
      flex: 1,
      ...typography.valueLarge,
      color: colors.textPrimary,
      paddingVertical: spacing.md,
    },
    fieldHint: {
      ...typography.caption,
      color: colors.textMuted,
      lineHeight: 20,
    },
    sectionLabel: {
      ...typography.bodyStrong,
      color: colors.textPrimary,
    },
    methodsGrid: {
      ...getRtlRow(),
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    methodCard: {
      width: '48%',
      backgroundColor: colors.bgSurface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      padding: spacing.md,
      alignItems: 'center',
      gap: spacing.sm,
      position: 'relative',
    },
    methodCardActive: {
      borderColor: colors.electric,
      backgroundColor: `${colors.electric}10`,
    },
    methodLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    methodLabelActive: {
      color: colors.textBrandStrong,
    },
    methodCheck: {
      position: 'absolute',
      top: 8,
      left: 8,
      width: 20,
      height: 20,
      borderRadius: 12,
      backgroundColor: colors.electric,
      alignItems: 'center',
      justifyContent: 'center',
    },
    payBtnWrap: {
      borderRadius: radius.xl,
      overflow: 'hidden',
      marginTop: spacing.sm,
    },
    payBtn: {
      ...getRtlRow(),
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md + 2,
    },
    payBtnPressed: { opacity: motion.press.opacity },
    payBtnText: {
      ...typography.button,
      color: '#fff',
    },
    resultWrap: {
      padding: spacing.xl,
      gap: spacing.md,
      alignItems: 'center',
    },
    successIcon: { marginBottom: spacing.sm },
    errorIcon: { marginBottom: spacing.sm },
    resultTitle: {
      ...typography.h3,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    errorBody: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 24,
    },
    cancelBtn: { paddingVertical: spacing.sm },
    cancelText: {
      ...typography.bodyStrong,
      color: colors.textMuted,
    },
  });
}
