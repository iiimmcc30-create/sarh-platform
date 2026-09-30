// Sarh — Verification (Blue / Gold badge) subscribe sheet.
// Layout follows the approved X-Premium-style mobile sheet: close, hero badge,
// headline, Blue/Gold tabs, one rounded feature list, the monthly plan, a pill
// CTA and fine print. The page is ALWAYS dark (black) in light and dark mode.
// Prices come from the plans API only; renewal is manual (no auto-charge).
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { SwipeTabIndicator } from '@/components/ui/SwipeTabIndicator';
import { VerificationHero } from '@/components/verification/VerificationHero';
import { AppText } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { duration } from '@/design-system/tokens';
import { radius, spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { useTabLayouts } from '@/hooks/useTabLayouts';
import { alertMessage, confirmDestructive } from '@/lib/actionSheet';
import { getRtlRow } from '@/lib/rtl';
import { VERIFIED_BADGE_COLORS } from '@/lib/verifiedBadge';
import { launchPaymentCheckout } from '@/services/payments';
import {
  VERIFICATION_STATE_LABEL_AR,
  VERIFICATION_TIER_COPY,
  cancelVerificationSubscription,
  extraDailyFor,
  fetchVerificationPlans,
  fetchVerificationStatus,
  formatArabicDate,
  initiateVerificationSubscription,
  subscriptionStateLabelAr,
  type VerificationPlan,
  type VerificationStatus,
  type VerificationTierId,
} from '@/services/verification';

const TIERS: VerificationTierId[] = ['blue', 'gold'];
const TAB_LABEL: Record<VerificationTierId, string> = { blue: 'Blue', gold: 'Gold' };

/**
 * Fixed dark palette (this screen is black in both themes). Contrast on #000:
 * text 17:1, secondary 6.9:1 (AA), on the #16181C list 6.1:1 (AA).
 */
export const VERIFICATION_DARK = {
  bg: '#000000',
  surface: '#16181C',
  border: '#2F3336',
  text: '#E7E9EA',
  textSecondary: '#8B98A5',
  ctaBg: '#E7E9EA',
  ctaText: '#0F1419',
  ctaDisabledBg: '#2F3336',
  ctaDisabledText: '#8B98A5',
  danger: '#F4868C',
} as const;
const D = VERIFICATION_DARK;

function priceAmount(plan: VerificationPlan | undefined): string | null {
  // Price comes only from the plans API (Plan table, admin-configurable).
  if (!plan || !plan.priceConfigured) return null;
  const amount = Number.isInteger(plan.monthlyPrice)
    ? String(plan.monthlyPrice)
    : plan.monthlyPrice.toFixed(2);
  const currency = !plan.currency || plan.currency === 'SAR' ? 'ر.س' : plan.currency;
  return `${amount} ${currency}`;
}

type Feature = { icon: string; label: string; info?: string };

function featuresFor(tier: VerificationTierId, plan: VerificationPlan | undefined): Feature[] {
  const extra = extraDailyFor(plan, tier);
  const common: Feature[] = [
    {
      icon: 'eye-outline',
      label: 'الشارة في ملفك ومنشوراتك وإعلاناتك ومحادثاتك',
    },
  ];
  if (tier === 'gold') {
    return [
      { icon: 'verified', label: 'شارة توثيق ذهبية' },
      {
        icon: 'trending-up-outline',
        label: 'أعلى ظهور لحسابك وإعلاناتك',
        info: 'أولوية أعلى من الشارة الزرقاء في ترتيب البحث والرئيسية.',
      },
      {
        icon: 'add-circle-outline',
        label: `+${extra} إعلانات إضافية يومياً`,
        info: 'تُضاف فوق الحد الأساسي لنشر الإعلانات كل 24 ساعة.',
      },
      ...common,
      {
        icon: 'storefront-outline',
        label: 'توثيق التاجر',
        info: 'تظهر الشارة الذهبية بعد قبول توثيق التاجر: الهوية، بيانات المنشأة، والسجل التجاري.',
      },
      { icon: 'time-outline', label: 'المزايا مرتبطة باشتراكك الفعّال' },
    ];
  }
  return [
    { icon: 'verified', label: 'شارة توثيق زرقاء' },
    {
      icon: 'trending-up-outline',
      label: 'ظهور أعلى لحسابك وإعلاناتك',
      info: 'أولوية في ترتيب البحث.',
    },
    {
      icon: 'add-circle-outline',
      label: `+${extra} إعلانات إضافية يومياً`,
      info: 'تُضاف فوق الحد الأساسي لنشر الإعلانات كل 24 ساعة.',
    },
    ...common,
    { icon: 'checkmark-done-outline', label: 'بدون طلب توثيق: تظهر فور تفعيل الاشتراك' },
    { icon: 'time-outline', label: 'المزايا مرتبطة باشتراكك الفعّال' },
  ];
}

export default function VerificationScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { isAuthenticated, accessToken } = useAuth();
  const { isCompact } = useLayout();

  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [plans, setPlans] = useState<VerificationPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<VerificationTierId | null>(null);

  const load = useCallback(async () => {
    if (isAuthenticated) {
      const data = await fetchVerificationStatus();
      setStatus(data);
      if (data) setPlans(data.plans);
    } else {
      setStatus(null);
      setPlans(await fetchVerificationPlans());
    }
    setLoading(false);
  }, [isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      void load();
      // Black page in both themes: light status-bar content while focused.
      setStatusBarStyle('light');
      return () => setStatusBarStyle(isDark ? 'light' : 'dark');
    }, [load, isDark]),
  );

  const tier: VerificationTierId =
    selected ?? status?.subscription.tier ?? status?.verification.approvedTier ?? 'blue';
  const tierIndex = TIERS.indexOf(tier);
  const plan = plans.find((p) => p.tier === tier);
  const copy = VERIFICATION_TIER_COPY[tier];
  const sub = status?.subscription;
  const verification = status?.verification;
  const subscribedHere =
    !!sub && sub.tier === tier && (sub.state === 'active' || sub.state === 'canceled');
  const subscribedOther =
    !!sub && !!sub.tier && sub.tier !== tier && (sub.state === 'active' || sub.state === 'canceled');
  const renewing = !!sub && sub.tier === tier && (sub.state === 'grace_period' || sub.state === 'expired');
  const price = priceAmount(plan);

  // Tabs: one sliding underline (existing SwipeTabIndicator pattern).
  const { layouts, onTabLayout } = useTabLayouts(TIERS.length);
  const [progress] = useState(() => new Animated.Value(tierIndex));
  useEffect(() => {
    Animated.timing(progress, {
      toValue: tierIndex,
      duration: duration.ui,
      useNativeDriver: false,
    }).start();
  }, [progress, tierIndex]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/' as never);
  };

  const goVerify = () => {
    router.push('/support/verification' as never);
  };

  const subscribe = async () => {
    if (!isAuthenticated || !accessToken) {
      router.push('/auth/welcome' as never);
      return;
    }
    if (!plan?.available || !sub?.id) return;
    setBusy(true);
    const res = await initiateVerificationSubscription({ plan, subscriptionId: sub.id });
    setBusy(false);
    if (!res.ok) {
      void alertMessage('تعذّر بدء الاشتراك', res.error);
      return;
    }
    await launchPaymentCheckout({
      accessToken,
      paymentId: res.paymentId,
      checkoutUrl: res.checkoutUrl,
      devMode: res.devMode,
      context: 'subscription',
      returnParams: { returnTo: 'verification' },
    });
    void load();
  };

  const cancelRenewal = async () => {
    const until = formatArabicDate(sub?.renewDate);
    const ok = await confirmDestructive(
      'إلغاء الاشتراك',
      until
        ? `ستبقى الشارة والمزايا فعّالة حتى ${until}، ولن نرسل لك تذكيرات التجديد.`
        : 'ستبقى المزايا فعّالة حتى نهاية الفترة المدفوعة.',
      'إلغاء الاشتراك',
    );
    if (!ok) return;
    setBusy(true);
    const res = await cancelVerificationSubscription();
    setBusy(false);
    if (!res.ok) void alertMessage('تعذّر الإلغاء', res.error);
    void load();
  };

  // Verification applies to Gold only (merchant). Blue = active subscription only.
  const goldApproved = verification?.approvedTier === 'gold';
  const goldVerificationState = goldApproved
    ? 'approved'
    : verification && verification.state !== 'approved'
      ? verification.state
      : 'not_started';
  const verificationLine = VERIFICATION_STATE_LABEL_AR[goldVerificationState];
  /** Gold checkout opens only after the merchant verification is approved. */
  const goldLocked = tier === 'gold' && !goldApproved;

  const cta = ((): { title: string; onPress: () => void; disabled: boolean } => {
    const none = () => undefined;
    if (!isAuthenticated) {
      return { title: 'سجّل الدخول للاشتراك', onPress: () => router.push('/auth/welcome' as never), disabled: false };
    }
    if (subscribedHere) return { title: 'مشترك', onPress: none, disabled: true };
    if (subscribedOther && tier === 'blue') return { title: 'مشترك في Gold', onPress: none, disabled: true };
    if (goldLocked) {
      return goldVerificationState === 'pending_review'
        ? { title: 'التحقق قيد المراجعة', onPress: none, disabled: true }
        : { title: 'أكمل التحقق', onPress: goVerify, disabled: false };
    }
    if (!plan?.available) return { title: 'غير متاح حالياً', onPress: none, disabled: true };
    if (renewing) return { title: 'جدّد الآن', onPress: () => void subscribe(), disabled: false };
    if (subscribedOther && tier === 'gold') {
      return { title: 'الترقية والدفع', onPress: () => void subscribe(), disabled: false };
    }
    return { title: 'الاشتراك والدفع', onPress: () => void subscribe(), disabled: false };
  })();

  const ctaNote = (() => {
    if (subscribedHere && sub?.state === 'active') {
      return `اشتراكك فعّال حتى ${formatArabicDate(sub.renewDate)}. جدّد بدفعة جديدة عند موعد التجديد.`;
    }
    if (subscribedHere && sub?.state === 'canceled') {
      return `ألغيت الاشتراك. تبقى الشارة والمزايا حتى ${formatArabicDate(sub.renewDate)}.`;
    }
    if (goldLocked) return 'الشارة الذهبية تتطلب قبول توثيق التاجر قبل الاشتراك.';
    return price
      ? `تجديد يدوي: ${price} كل شهر عند موعد التجديد، بدون أي خصم تلقائي.`
      : 'تجديد يدوي كل شهر، بدون أي خصم تلقائي.';
  })();

  const features = featuresFor(tier, plan);
  const heroWidth = isCompact ? 240 : 280;

  return (
    <Screen edges={['top', 'bottom']} pattern={false} style={styles.screen}>
      <ScreenBody padTop="sm" padBottom="xxxl" width="form" gap="none" style={styles.screen}>
        {/* Close (inline end = top-left in RTL) */}
        <View style={[styles.closeRow, getRtlRow()]}>
          <Pressable
            onPress={close}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          >
            <AppIcon name="close" size={22} color={D.text} />
          </Pressable>
        </View>

        <VerificationHero tier={tier} width={heroWidth} />

        <AppText variant="heading2" align="center" style={[styles.text, styles.headline]}>
          {tier === 'gold' ? 'الشارة الذهبية للتجار الموثّقين' : 'وثّق حسابك بالشارة الزرقاء'}
        </AppText>
        <AppText variant="bodySmall" align="center" style={styles.secondary}>
          {copy.audience}
        </AppText>

        {/* Blue / Gold tabs with one sliding underline */}
        <View style={[styles.tabs, getRtlRow()]} accessibilityRole="tablist">
          {TIERS.map((t, i) => {
            const active = t === tier;
            return (
              <Pressable
                key={t}
                onPress={() => setSelected(t)}
                onLayout={(e) => onTabLayout(i, e)}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t === 'gold' ? 'Gold — الشارة الذهبية' : 'Blue — الشارة الزرقاء'}
              >
                <AppText variant="label" style={active ? styles.tabActive : styles.tabIdle}>
                  {TAB_LABEL[t]}
                </AppText>
              </Pressable>
            );
          })}
          <SwipeTabIndicator
            progress={progress}
            layouts={layouts}
            count={TIERS.length}
            inset={spacing.xl}
            color={D.text}
            thickness={2}
          />
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={D.textSecondary} />
          </View>
        ) : null}

        {/* Feature list: one rounded dark container */}
        <View style={styles.list}>
          {features.map((f) => (
            <View key={f.label} style={[styles.featureRow, getRtlRow()]}>
              <AppIcon name={f.icon} size={20} color={VERIFIED_BADGE_COLORS[tier]} />
              <AppText variant="body" style={[styles.text, styles.featureText]}>
                {f.label}
              </AppText>
              {f.info ? (
                <Pressable
                  onPress={() => void alertMessage(f.label, f.info)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`معلومات: ${f.label}`}
                >
                  <AppIcon name="information-circle-outline" size={18} color={D.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>

        {/* Compact status (signed-in) */}
        {isAuthenticated && status ? (
          <View style={styles.status}>
            <View style={[styles.statusRow, getRtlRow()]}>
              <AppText variant="caption" style={styles.secondary}>الاشتراك</AppText>
              <AppText variant="caption" style={[styles.text, styles.statusValue]}>
                {sub?.tier ? `${TAB_LABEL[sub.tier]} · ` : ''}
                {sub ? subscriptionStateLabelAr(sub) : 'غير مشترك'}
              </AppText>
            </View>
            {tier === 'gold' ? (
              <View style={[styles.statusRow, getRtlRow()]}>
                <AppText variant="caption" style={styles.secondary}>توثيق التاجر</AppText>
                <AppText variant="caption" style={[styles.text, styles.statusValue]}>{verificationLine}</AppText>
              </View>
            ) : null}
            {tier === 'gold' &&
            verification?.reviewReason &&
            (goldVerificationState === 'rejected' || goldVerificationState === 'needs_amendments') ? (
              <AppText variant="caption" style={styles.danger}>{verification.reviewReason}</AppText>
            ) : null}
            <View style={[styles.statusRow, getRtlRow()]}>
              <AppText variant="caption" style={styles.secondary}>الشارة</AppText>
              <AppText variant="caption" style={[styles.text, styles.statusValue]}>
                {status.badge.visible
                  ? status.badge.tier === 'gold'
                    ? 'Gold · ظاهرة'
                    : 'Blue · ظاهرة'
                  : 'غير ظاهرة'}
              </AppText>
            </View>
          </View>
        ) : null}

        {/* Plan selector: the single monthly option, selected */}
        <View
          style={[styles.plan, getRtlRow()]}
          accessibilityRole="radio"
          accessibilityState={{ selected: true }}
          accessibilityLabel={`شهرياً ${price ?? ''}`}
        >
          <Stack gap="xs" style={styles.planText}>
            <AppText variant="label" style={styles.text}>شهرياً</AppText>
            <AppText variant="heading3" style={styles.text}>
              {price ? `${price} / الشهر` : '—'}
            </AppText>
            <AppText variant="caption" style={styles.secondary}>تجديد يدوي كل شهر</AppText>
          </Stack>
          <AppIcon name="checkmark-circle" size={22} color={D.text} />
        </View>

        {/* CTA */}
        <Pressable
          onPress={cta.onPress}
          disabled={cta.disabled || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: cta.disabled || busy, busy }}
          style={({ pressed }) => [
            styles.cta,
            (cta.disabled || busy) && styles.ctaDisabled,
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={D.ctaText} />
          ) : (
            <AppText variant="label" style={cta.disabled ? styles.ctaTextDisabled : styles.ctaText}>
              {cta.title}
            </AppText>
          )}
        </Pressable>
        <AppText variant="caption" align="center" style={[styles.secondary, styles.ctaNote]}>
          {ctaNote}
        </AppText>
        {subscribedHere && sub?.state === 'active' ? (
          <Pressable
            onPress={() => void cancelRenewal()}
            disabled={busy}
            accessibilityRole="button"
            style={styles.cancel}
          >
            <AppText variant="caption" align="center" style={styles.danger}>إلغاء الاشتراك</AppText>
          </Pressable>
        ) : null}

        {/* Fine print */}
        <AppText variant="caption" style={[styles.secondary, styles.finePrint]}>
          بالاشتراك، فإنك توافق على شروط الاستخدام في سرح. الاشتراك شهري ويُجدَّد يدوياً فقط: لا نحفظ
          بطاقتك ولا نخصم أي مبلغ تلقائياً. نذكّرك قبل موعد التجديد بـ 7 أيام و3 أيام ويوم واحد وفي يوم
          التجديد، ولديك مهلة 3 أيام بعده قبل إيقاف المزايا والشارة. يمكنك إلغاء الاشتراك في أي وقت وتبقى
          المزايا حتى نهاية الفترة المدفوعة. الشارة الزرقاء لا تحتاج أي طلب توثيق، والشارة الذهبية تتطلب
          قبول توثيق التاجر.
        </AppText>
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: D.bg },
  text: { color: D.text },
  secondary: { color: D.textSecondary },
  danger: { color: D.danger },
  pressed: { opacity: 0.7 },
  closeRow: { justifyContent: 'flex-end', minHeight: 40, alignItems: 'center' },
  closeBtn: { padding: spacing.xs },
  headline: { marginTop: spacing.md, letterSpacing: -0.2 },
  tabs: {
    marginTop: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: D.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  tabActive: { color: D.text, fontWeight: '700' },
  tabIdle: { color: D.textSecondary },
  loading: { paddingVertical: spacing.lg, alignItems: 'center' },
  list: {
    marginTop: spacing.lg,
    backgroundColor: D.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  featureRow: { alignItems: 'center', gap: spacing.md, minHeight: 44, paddingVertical: spacing.xs },
  featureText: { flex: 1, minWidth: 0 },
  status: { marginTop: spacing.lg, gap: spacing.xs },
  statusRow: { justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, minHeight: 24 },
  statusValue: { flexShrink: 1 },
  plan: {
    marginTop: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: D.text,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  planText: { flex: 1, minWidth: 0 },
  cta: {
    marginTop: spacing.lg,
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: D.ctaBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  ctaDisabled: { backgroundColor: D.ctaDisabledBg },
  ctaText: { color: D.ctaText, fontWeight: '700' },
  ctaTextDisabled: { color: D.ctaDisabledText },
  ctaNote: { marginTop: spacing.sm },
  cancel: { marginTop: spacing.sm, paddingVertical: spacing.xs },
  finePrint: {
    marginTop: spacing.xl,
    lineHeight: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: D.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
