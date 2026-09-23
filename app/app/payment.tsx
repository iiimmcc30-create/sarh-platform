// SARH — Payment Screen (Network International)
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { PaymentBrandLogo } from '@/components/payment/PaymentBrandLogos';
import { functional, motion } from '@/design-system';
import { AppText, SarhButton, SarhInput } from '@/design-system/components';
import { BottomAction, Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/services/api';
import { launchPaymentCheckout } from '@/services/payments';
import { NIPaymentMethod, PAYMENT_METHODS } from '@/services/network_international';
import { normalizeSlug, planGradientColors } from '@/services/subscriptionPlans';
import { usePlans } from '@/hooks/usePlans';
import { useSubscriptionAudience } from '@/hooks/useSubscriptionAudience';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { type ThemeColors } from '@/constants/theme';

type Step = 'method' | 'card_details' | 'processing' | 'success';

function formatCardDisplay(num: string): string {
  const n = num.replace(/\D/g, '');
  const groups = [];
  for (let i = 0; i < 16; i += 4) {
    groups.push(n.slice(i, i + 4).padEnd(4, '·'));
  }
  return groups.join('  ');
}

function formatExpiryDisplay(val: string): string {
  const n = val.replace(/\D/g, '');
  if (n.length >= 2) return n.slice(0, 2) + '/' + n.slice(2, 4).padEnd(2, 'YY'.slice(n.length > 2 ? 0 : 2));
  return n.padEnd(2, 'MM'.slice(n.length));
}

function VirtualCard({
  cardNumber,
  cardName,
  expiry,
  methodId,
}: {
  cardNumber: string;
  cardName: string;
  expiry: string;
  methodId: NIPaymentMethod | null;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createVirtualCardStyles(c));
  const brand = PAYMENT_METHODS.find((m) => m.id === methodId)?.color ?? colors.bgElevated;
  const cardColor: [string, string] = [brand, brand];

  return (
    <LinearGradient colors={cardColor} style={styles.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <Row justify="between" align="start">
        <View style={styles.chip}>
          <View style={styles.chipLine} />
          <View style={styles.chipLine} />
        </View>
        {methodId ? <PaymentBrandLogo id={methodId} size={22} /> : null}
      </Row>
        <AppText variant="heading3" align="center" style={{ color: functional.onPrimary, letterSpacing: 2.5 }}>
        {formatCardDisplay(cardNumber)}
      </AppText>
      <Row justify="between" align="end">
        <Stack gap="xs">
          <AppText variant="caption" style={{ color: functional.onPrimary }}>اسم حامل البطاقة</AppText>
          <AppText variant="label" numberOfLines={1} style={{ color: functional.onPrimary }}>
            {cardName.toUpperCase() || '· · · · · · · · · ·'}
          </AppText>
        </Stack>
        <Stack gap="xs" align="end">
          <AppText variant="caption" style={{ color: functional.onPrimary }}>صالحة حتى</AppText>
          <AppText variant="label" style={{ color: functional.onPrimary }}>{formatExpiryDisplay(expiry)}</AppText>
        </Stack>
      </Row>
    </LinearGradient>
  );
}

function createVirtualCardStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderRadius: 20,
      padding: 24,
      marginBottom: 24,
      height: 200,
      justifyContent: 'space-between',
      overflow: 'hidden',
    },
    chip: {
      width: 42,
      height: 32,
      borderRadius: 6,
      backgroundColor: colors.gold,
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingVertical: 4,
    },
    chipLine: {
      width: '80%',
      height: 3,
      backgroundColor: colors.amber,
      borderRadius: 2,
    },
  });
}

export default function PaymentScreen() {
  const { colors, gradients } = useTheme();
  const styles = useThemedStyles(({ colors: c, scheme }) => createStyles(c, scheme));
  const router = useRouter();
  const { planId, cycle } = useLocalSearchParams<{ planId: string; cycle: 'monthly' | 'yearly' }>();
  const { accessToken } = useAuth();
  const { subscription, refetchSubscription } = useSubscription();
  const planAudience = useSubscriptionAudience();
  const { plans, getPlanBySlug } = usePlans(planAudience);
  const paidFallback = planAudience === 'BUTCHER' ? 'nom-pro' : 'sarh-pro';
  const defaultPaidSlug = plans.find((p) => p.monthlyPrice > 0)?.slug ?? paidFallback;
  const slug = normalizeSlug(planId ?? defaultPaidSlug);
  const plan = getPlanBySlug(slug);
  const [planColor, planColorEnd] = planGradientColors(plan.sortOrder);
  const billingCycle = cycle ?? 'monthly';
  const amount = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;

  const [step, setStep] = useState<Step>('method');
  const [selectedMethod, setSelectedMethod] = useState<NIPaymentMethod | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [loading, setLoading] = useState(false);
  const [transactionId, setTransactionId] = useState('');

  const stepAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0.6)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (planId) {
      router.replace('/subscription' as never);
    }
  }, [planId, router]);

  useEffect(() => {
    if (!subscription.id && accessToken) void refetchSubscription();
  }, [subscription.id, accessToken, refetchSubscription]);

  useEffect(() => {
    Animated.timing(stepAnim, { toValue: 1, duration: motion.duration.screen, useNativeDriver: true }).start();
    return () => { stepAnim.setValue(0); };
  }, [step]);

  useEffect(() => {
    if (step === 'success') {
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, useNativeDriver: true, ...motion.spring.success }),
        Animated.timing(successOpacity, { toValue: 1, duration: motion.duration.slow, useNativeDriver: true }),
      ]).start();
    }
  }, [step]);

  const needsCardForm = selectedMethod === 'mada' || selectedMethod === 'visa' || selectedMethod === 'mastercard';
  const isWallet = selectedMethod === 'apple_pay' || selectedMethod === 'stc_pay';

  const formatCardInput = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 16);
    return clean.replace(/(.{4})/g, '$1 ').trim();
  };

  const handleSelectMethod = (method: NIPaymentMethod) => setSelectedMethod(method);

  const handlePay = async () => {
    if (!selectedMethod) return;
    if (needsCardForm && step === 'method') { setStep('card_details'); return; }

    if (!accessToken) { Alert.alert('غير مصرح', 'يجب تسجيل الدخول لإتمام الدفع'); return; }
    if (!subscription.id) {
      Alert.alert('خطأ', 'تعذر تحميل بيانات الاشتراك، يرجى المحاولة مجدداً.');
      return;
    }

    setLoading(true);
    setStep('processing');

    try {
      const res = await fetch(`${API_BASE}/api/payments/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          amount,
          currency: 'SAR',
          method: selectedMethod,
          type: 'subscription',
          referenceId: subscription.id,
          planId: plan.slug,
          billingCycle,
          description: `sarh ${plan.name} subscription - ${billingCycle}`,
          descriptionAr: `اشتراك سرح ${plan.name} - ${billingCycle === 'yearly' ? 'سنوي' : 'شهري'}`,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (res.ok && json.success && json.data) {
        const { checkoutUrl, paymentId, devMode } = json.data as {
          checkoutUrl?: string;
          paymentId?: string;
          devMode?: boolean;
        };

        setStep('method');
        setLoading(false);

        await launchPaymentCheckout({
          accessToken,
          paymentId,
          checkoutUrl,
          devMode,
          context: 'subscription',
        });
        return;
      } else {
        setStep('method');
        const detail =
          json.messageAr ||
          (json.error === 'payment_gateway_error'
            ? 'تعذر إنشاء رابط الدفع. حاول مرة أخرى بعد قليل.'
            : json.message) ||
          'حدث خطأ أثناء الدفع.';
        Alert.alert('فشل الدفع', String(detail));
      }
    } catch {
      setStep('method');
      Alert.alert('فشل الدفع', 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.');
    } finally {
      setLoading(false);
    }
  };

  const ctaTitle =
    step === 'method' && needsCardForm
      ? 'التالي · إدخال بيانات البطاقة'
      : step === 'method' && isWallet
        ? `ادفع ${amount} ريال`
        : `ادفع ${amount} ريال الآن`;

  if (step === 'success') {
    return (
      <Screen edges={['top', 'bottom']} pattern={false} style={styles.screen}>
        <LinearGradient colors={gradients.hero} style={StyleSheet.absoluteFill} />
        <ScreenBody scroll={false}>
          <Animated.View style={[styles.successCenter, { transform: [{ scale: successScale }], opacity: successOpacity }]}>
            <Stack gap="lg" align="center">
              <LinearGradient colors={[planColor, planColorEnd]} style={styles.successIcon}>
                <AppIcon name="check-bold" size={52} color={functional.onPrimary} />
              </LinearGradient>
              <AppText variant="heading1" align="center">تمّ الاشتراك بنجاح 🎉</AppText>
              <AppText variant="body" color="textSecondary" align="center">
                أهلاً بك في باقة {plan.name}
              </AppText>
              <Stack gap="sm" style={styles.receiptCard}>
                <Row gap="xs" align="center">
                  <AppIcon name="receipt-outline" size={16} color={colors.textMuted} />
                  <AppText variant="label" color="textMuted">تفاصيل العملية</AppText>
                </Row>
                <ReceiptRow label="الباقة" value={plan.name} />
                <ReceiptRow label="دورة الفوترة" value={billingCycle === 'yearly' ? 'سنوي' : 'شهري'} />
                <ReceiptRow label="المبلغ المدفوع" value={`${amount} ريال`} highlight />
                <ReceiptRow label="طريقة الدفع" value={PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.arabic ?? ''} />
                {transactionId ? <ReceiptRow label="رقم العملية" value={transactionId} small /> : null}
              </Stack>
              <SarhButton
                title="ابدأ الاستخدام"
                fullWidth
                onPress={() => { router.dismissAll(); router.replace('/(tabs)/profile'); }}
              />
            </Stack>
          </Animated.View>
        </ScreenBody>
      </Screen>
    );
  }

  if (step === 'processing') {
    return (
      <Screen edges={['top', 'bottom']} pattern={false} style={styles.screen}>
        <LinearGradient colors={gradients.hero} style={StyleSheet.absoluteFill} />
        <ScreenBody scroll={false}>
          <Stack gap="lg" align="center" fill style={styles.processingWrap}>
            <View style={styles.processingIconWrap}>
              <ActivityIndicator size="large" color={planColorEnd} />
            </View>
            <AppText variant="heading2">جارٍ معالجة الدفع...</AppText>
            <AppText variant="body" color="textMuted">يُرجى الانتظار، لا تغلق التطبيق</AppText>
            <Row gap="xs" align="center" style={styles.processingBadge}>
              <AppIcon name="shield-lock" size={14} color={colors.emerald} />
              <AppText variant="caption" color="success">محمي بـ Network International · PCI-DSS Level 1</AppText>
            </Row>
          </Stack>
        </ScreenBody>
      </Screen>
    );
  }

  const steps = ['طريقة الدفع', needsCardForm ? 'بيانات البطاقة' : null, 'الدفع'].filter(Boolean) as string[];
  const currentStepIdx = step === 'method' ? 0 : step === 'card_details' ? 1 : 2;

  return (
    <Screen edges={['top']} keyboard pattern={false} style={styles.screen}>
      <LinearGradient colors={gradients.hero} style={StyleSheet.absoluteFill} />
      <ScreenHeader
        variant="screen"
        title="الدفع الآمن"
        showBack
        onBackPress={() => (step === 'card_details' ? setStep('method') : router.back())}
      />

      <Row justify="center" gap="xs" style={styles.stepRow}>
        {steps.map((s, i) => (
          <Row key={s} gap="xs" align="center">
            <View style={[styles.stepDot, i <= currentStepIdx && styles.stepDotActive]}>
              {i < currentStepIdx
                ? <AppIcon name="checkmark" size={10} color={functional.onPrimary} />
                : (
                  <AppText variant="caption" color={i <= currentStepIdx ? 'textPrimary' : 'textMuted'}>
                    {i + 1}
                  </AppText>
                )}
            </View>
            <AppText variant="caption" color={i === currentStepIdx ? 'primary' : 'textMuted'}>{s}</AppText>
          </Row>
        ))}
      </Row>

      <Animated.View style={{ flex: 1, opacity: stepAnim }}>
        <ScreenBody padTop="sm" padBottom="xl" gap="md" bottomInset="action">
          <LinearGradient
            colors={[planColor, planColorEnd]}
            style={styles.orderCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Row justify="between" align="start">
              <Stack gap="xs">
                <AppText variant="caption" style={{ color: functional.onPrimary }}>
                  {billingCycle === 'yearly' ? 'اشتراك سنوي' : 'اشتراك شهري'}
                </AppText>
                <AppText variant="heading2" style={{ color: functional.onPrimary }}>باقة {plan.name}</AppText>
              </Stack>
              <Stack gap="xs" align="end">
                <AppText variant="display" style={{ color: functional.onPrimary }}>{amount}</AppText>
                <AppText variant="label" style={{ color: functional.onPrimary }}>ريال</AppText>
              </Stack>
            </Row>
            {billingCycle === 'yearly' && plan.monthlyPrice > 0 ? (
              <Row gap="xs" align="center" style={styles.savingsTag}>
                <AppIcon name="tag" size={12} color={functional.onPrimary} />
                <AppText variant="caption" style={{ color: functional.onPrimary }}>
                  وفّرت {Math.round(plan.monthlyPrice * 12 - plan.yearlyPrice)} ريال مقارنةً بالاشتراك الشهري
                </AppText>
              </Row>
            ) : null}
          </LinearGradient>

          {step === 'method' ? (
            <Stack gap="md">
              <AppText variant="heading3">اختر طريقة الدفع</AppText>
              <Row gap="md" wrap>
                {PAYMENT_METHODS.filter((m) => ['mada', 'visa', 'mastercard'].includes(m.id)).map((method) => {
                  const chosen = selectedMethod === method.id;
                  return (
                    <Pressable
                      key={method.id}
                      onPress={() => handleSelectMethod(method.id)}
                      style={[
                        styles.methodCard,
                        chosen && [styles.methodCardActive, { borderColor: method.color }],
                      ]}
                    >
                      <PaymentBrandLogo id={method.id} size={24} />
                      <AppText variant="caption" color="textSecondary">{method.arabic}</AppText>
                    </Pressable>
                  );
                })}
              </Row>

              <AppText variant="label" color="textMuted">المحافظ الرقمية</AppText>
              <Stack gap="sm">
                {PAYMENT_METHODS.filter((m) => ['apple_pay', 'stc_pay'].includes(m.id)).map((method) => {
                  const chosen = selectedMethod === method.id;
                  return (
                    <Pressable
                      key={method.id}
                      onPress={() => handleSelectMethod(method.id)}
                      style={[
                        styles.walletCard,
                        chosen && [styles.walletCardActive, { borderColor: method.color }],
                      ]}
                    >
                      <Row gap="md" align="center">
                        <PaymentBrandLogo id={method.id} size={26} />
                        <Stack gap="xs" style={styles.flex}>
                          <AppText variant="heading3">{method.arabic}</AppText>
                          <AppText variant="caption" color="textMuted">دفع سريع وآمن</AppText>
                        </Stack>
                        <View style={[styles.radioCircle, chosen && { backgroundColor: method.color, borderColor: method.color }]} />
                      </Row>
                    </Pressable>
                  );
                })}
              </Stack>
            </Stack>
          ) : null}

          {step === 'card_details' ? (
            <Stack gap="md">
              <VirtualCard
                cardNumber={cardNumber}
                cardName={cardName}
                expiry={expiry}
                methodId={selectedMethod}
              />
              <AppText variant="heading3">بيانات البطاقة</AppText>
              <SarhInput
                label="اسم حامل البطاقة"
                value={cardName}
                onChangeText={setCardName}
                placeholder="كما يظهر على البطاقة"
                autoCapitalize="characters"
              />
              <SarhInput
                label="رقم البطاقة"
                value={cardNumber}
                onChangeText={(t) => setCardNumber(formatCardInput(t))}
                placeholder="0000  0000  0000  0000"
                keyboardType="number-pad"
                maxLength={19}
                leadingIcon="credit-card-outline"
                ltr
              />
              <Row gap="md">
                <View style={styles.flex}>
                  <SarhInput
                    label="تاريخ الانتهاء"
                    value={expiry}
                    onChangeText={(t) => {
                      const n = t.replace(/\D/g, '').slice(0, 4);
                      setExpiry(n.length > 2 ? n.slice(0, 2) + '/' + n.slice(2) : n);
                    }}
                    placeholder="MM/YY"
                    keyboardType="number-pad"
                    maxLength={5}
                    ltr
                  />
                </View>
                <View style={styles.flex}>
                  <SarhInput
                    label="رمز CVV"
                    value={cvv}
                    onChangeText={(t) => setCvv(t.replace(/\D/g, '').slice(0, 4))}
                    placeholder="•••"
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={4}
                    ltr
                  />
                </View>
              </Row>
              <Row gap="sm" align="center" style={styles.secureRow}>
                <AppIcon name="shield-lock" size={15} color={colors.emerald} />
                <AppText variant="caption" color="textSecondary">محمية بـ 3D Secure · TLS 1.3 · PCI-DSS Level 1</AppText>
              </Row>
            </Stack>
          ) : null}

          <Row justify="center" gap="xl">
            {[
              { icon: 'shield-lock', label: 'دفع مشفّر' },
              { icon: 'badge-check', label: 'PCI-DSS' },
              { icon: 'lock-outline', label: '3D Secure' },
            ].map((b) => (
              <Stack key={b.icon} gap="xs" align="center">
                <AppIcon name={b.icon} size={16} color={colors.textMuted} />
                <AppText variant="caption" color="textMuted">{b.label}</AppText>
              </Stack>
            ))}
          </Row>

          <Row justify="center" gap="xs" align="center">
            <AppIcon name="lock-outline" size={13} color={colors.textSubtle} />
            <AppText variant="caption" color="textMuted">مدفوعات آمنة عبر Network International</AppText>
          </Row>
        </ScreenBody>
      </Animated.View>

      <BottomAction>
        <SarhButton
          title={loading ? '...' : ctaTitle}
          fullWidth
          loading={loading}
          disabled={!selectedMethod || loading}
          onPress={() => void handlePay()}
        />
      </BottomAction>
    </Screen>
  );
}

function ReceiptRow({ label, value, highlight, small }: { label: string; value: string; highlight?: boolean; small?: boolean }) {
  return (
    <Row justify="between" align="center">
      <AppText variant="bodySmall" color="textMuted">{label}</AppText>
      <AppText
        variant={highlight ? 'price' : small ? 'caption' : 'bodySmall'}
        color={highlight ? 'primary' : small ? 'textMuted' : 'textSecondary'}
        style={stylesFlex}
      >
        {value}
      </AppText>
    </Row>
  );
}

const stylesFlex = { flex: 1 };

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  const cardBg = scheme === 'dark' ? colors.bgElevated : colors.bgSurface;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.screenRoot },
    stepRow: { paddingHorizontal: 24, paddingBottom: 12 },
    stepDot: {
      width: 22,
      height: 22,
      borderRadius: 12,
      backgroundColor: colors.bgElevated,
      borderWidth: 1.5,
      borderColor: colors.borderMid,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepDotActive: { backgroundColor: colors.electric, borderColor: colors.electric },
    orderCard: { borderRadius: 20, padding: 20, gap: 8 },
    savingsTag: {
      backgroundColor: `${colors.bgDeep}38`,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 99,
      alignSelf: 'flex-start',
    },
    methodCard: {
      flexGrow: 1,
      minWidth: '28%',
      aspectRatio: 1.4,
      backgroundColor: cardBg,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderColor: colors.borderSoft,
    },
    methodCardActive: { borderWidth: 2, backgroundColor: colors.bgDeep },
    walletCard: {
      padding: 16,
      borderRadius: 16,
      backgroundColor: cardBg,
      borderWidth: 1.5,
      borderColor: colors.borderSoft,
    },
    walletCardActive: { borderWidth: 2, backgroundColor: colors.bgDeep },
    flex: { flex: 1 },
    radioCircle: {
      width: 22,
      height: 22,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.borderMid,
    },
    secureRow: {
      backgroundColor: `${colors.emerald}12`,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: `${colors.emerald}30`,
    },
    processingWrap: { justifyContent: 'center' },
    processingIconWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    processingBadge: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 99,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    successCenter: { flex: 1, justifyContent: 'center' },
    successIcon: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    receiptCard: {
      width: '100%',
      backgroundColor: cardBg,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.borderMid,
    },
  });
}
