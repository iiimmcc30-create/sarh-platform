// Sarh — Verification (Blue / Blue+ / Gold) subscribe sheet.
// Layout follows the approved X-Premium-style mobile sheet: close, hero badge,
// headline, Blue/Blue+/Gold tabs, a compact comparison (no cards), one rounded
// feature list, the monthly plan, a pill CTA and fine print. The page is
// ALWAYS dark (black) in light and dark mode. Prices come from the plans API
// only; renewal is manual (no auto-charge). Gold needs a document before
// payment (the API enforces it too).
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { SwipeTabIndicator } from '@/components/ui/SwipeTabIndicator';
import { TierBadgeMark } from '@/components/verification/TierBadgeMark';
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
import { getRtlDirection, getRtlRow } from '@/lib/rtl';
import { VERIFIED_BADGE_COLORS } from '@/lib/verifiedBadge';
import { launchPaymentCheckout } from '@/services/payments';
import {
  VERIFICATION_STATE_LABEL_AR,
  VERIFICATION_TIER_COPY,
  VERIFICATION_TIER_ORDER,
  badgeColorOf,
  cancelVerificationSubscription,
  documentRequiredFor,
  extraDailyFor,
  fetchVerificationPlans,
  fetchVerificationStatus,
  formatArabicDate,
  initiateVerificationSubscription,
  subscriptionStateLabelAr,
  tierRank,
  type VerificationPlan,
  type VerificationStatus,
  type VerificationTierId,
} from '@/services/verification';

const TIERS = VERIFICATION_TIER_ORDER;

/** Latin labels / "+N" inside RTL text: isolate so "Blue+" and "+6" keep their order. */
const ltr = (text: string) => `\u2066${text}\u2069`;

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

const HEADLINE: Record<VerificationTierId, string> = {
  blue: 'وثّق حسابك بالشارة الزرقاء',
  blue_plus: `ارفع ظهورك مع ${ltr('Blue+')}`,
  gold: 'الشارة الذهبية للتجار الموثّقين',
};

/** Real benefits only (all enforced by the backend today). */
function featuresFor(tier: VerificationTierId, plan: VerificationPlan | undefined): Feature[] {
  const extra = extraDailyFor(plan, tier);
  const daily: Feature = {
    icon: 'add-circle-outline',
    label: `${ltr(`+${extra}`)} إعلانات إضافية يومياً`,
    info: 'تُضاف فوق الحد الأساسي لنشر الإعلانات كل 24 ساعة.',
  };
  const shown: Feature = { icon: 'eye-outline', label: 'الشارة في ملفك ومنشوراتك وإعلاناتك ومحادثاتك' };
  const active: Feature = { icon: 'time-outline', label: 'المزايا مرتبطة باشتراكك الفعّال' };
  const noDocs: Feature = { icon: 'checkmark-done-outline', label: 'بدون مستندات أو تحقق هوية' };
  if (tier === 'gold') {
    return [
      { icon: 'verified', label: 'شارة توثيق ذهبية' },
      {
        icon: 'trending-up-outline',
        label: 'أعلى أولوية ظهور لحسابك وإعلاناتك',
        info: 'تظهر إعلاناتك قبل Blue وBlue+ في ترتيب الإعلانات ونتائج البحث.',
      },
      daily,
      shown,
      {
        icon: 'document-text-outline',
        label: 'توثيق التاجر بالسجل التجاري',
        info: 'أرفق السجل التجاري قبل الدفع. تظهر الشارة الذهبية بعد قبول مراجعة التوثيق.',
      },
      active,
    ];
  }
  if (tier === 'blue_plus') {
    return [
      { icon: 'verified', label: 'شارة توثيق زرقاء' },
      {
        icon: 'trending-up-outline',
        label: `أولوية ظهور أعلى من ${ltr('Blue')}`,
        info: 'تظهر إعلاناتك قبل مشتركي Blue في ترتيب الإعلانات ونتائج البحث.',
      },
      { ...daily, label: `${ltr(`+${extra}`)} إعلانات إضافية يومياً للمستخدمين النشطين` },
      shown,
      noDocs,
      active,
    ];
  }
  return [
    { icon: 'verified', label: 'شارة توثيق زرقاء' },
    {
      icon: 'trending-up-outline',
      label: 'ظهور أعلى من الحساب العادي',
      info: 'أولوية في ترتيب الإعلانات ونتائج البحث.',
    },
    daily,
    shown,
    noDocs,
    active,
  ];
}

type CompareRow = { key: string; label: string; value: (t: VerificationTierId) => string; accent?: VerificationTierId };

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

  const tier: VerificationTierId = selected ?? status?.subscription.tier ?? 'blue';
  const tierIndex = TIERS.indexOf(tier);
  const planOf = (t: VerificationTierId) => plans.find((p) => p.tier === t);
  const plan = planOf(tier);
  const copy = VERIFICATION_TIER_COPY[tier];
  const color = badgeColorOf(tier);
  const sub = status?.subscription;
  const verification = status?.verification;
  const subActive = !!sub && (sub.state === 'active' || sub.state === 'canceled');
  const subscribedHere = subActive && sub?.tier === tier;
  const subscribedHigher = subActive && tierRank(sub?.tier) > tierIndex;
  const subscribedLower = subActive && !!sub?.tier && tierRank(sub.tier) < tierIndex;
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

  /** Existing verification request form (Gold document upload + review). */
  const goDocument = () => {
    router.push('/support/verification' as never);
  };

  // Gold: a document must be attached and submitted before payment.
  const docRequired = documentRequiredFor(plan, tier);
  const goldApproved = verification?.approvedTier === 'gold';
  const goldReady = goldApproved || status?.goldDocument?.ready === true;
  const goldVerificationState = goldApproved
    ? 'approved'
    : verification && verification.state !== 'approved'
      ? verification.state
      : 'not_started';
  const verificationLine = VERIFICATION_STATE_LABEL_AR[goldVerificationState];
  const docLocked = docRequired && !goldReady;

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
      if (res.code?.startsWith('gold_')) {
        void alertMessage('مستند مطلوب', res.error);
        void load();
        return;
      }
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

  const cta = ((): { title: string; onPress: () => void; disabled: boolean } => {
    const none = () => undefined;
    if (!isAuthenticated) {
      return { title: 'سجّل الدخول للاشتراك', onPress: () => router.push('/auth/welcome' as never), disabled: false };
    }
    if (subscribedHere) return { title: 'مشترك', onPress: none, disabled: true };
    if (subscribedHigher && sub?.tier) {
      return { title: `مشترك في ${ltr(VERIFICATION_TIER_COPY[sub.tier].label)}`, onPress: none, disabled: true };
    }
    if (docLocked) {
      return goldVerificationState === 'pending_review'
        ? { title: 'المستند قيد المراجعة', onPress: goDocument, disabled: false }
        : { title: 'أرفق المستند للمتابعة', onPress: goDocument, disabled: false };
    }
    if (!plan?.available) return { title: 'غير متاح حالياً', onPress: none, disabled: true };
    if (renewing) return { title: 'جدّد الآن', onPress: () => void subscribe(), disabled: false };
    if (subscribedLower) return { title: 'الترقية والدفع', onPress: () => void subscribe(), disabled: false };
    return { title: 'الاشتراك والدفع', onPress: () => void subscribe(), disabled: false };
  })();

  const ctaNote = (() => {
    if (subscribedHere && sub?.state === 'active') {
      return `اشتراكك فعّال حتى ${formatArabicDate(sub.renewDate)}. جدّد بدفعة جديدة عند موعد التجديد.`;
    }
    if (subscribedHere && sub?.state === 'canceled') {
      return `ألغيت الاشتراك. تبقى الشارة والمزايا حتى ${formatArabicDate(sub.renewDate)}.`;
    }
    if (docLocked) return 'Gold يتطلب إرفاق السجل التجاري وإرساله للمراجعة قبل الدفع.';
    if (tier === 'gold' && !goldApproved) {
      return 'تبدأ المزايا بعد الدفع، وتظهر الشارة الذهبية بعد قبول توثيق التاجر.';
    }
    return price
      ? `تجديد يدوي: ${price} كل شهر عند موعد التجديد، بدون أي خصم تلقائي.`
      : 'تجديد يدوي كل شهر، بدون أي خصم تلقائي.';
  })();

  const compareRows: CompareRow[] = [
    { key: 'price', label: 'السعر الشهري', value: (t) => priceAmount(planOf(t)) ?? '—' },
    { key: 'daily', label: 'إعلانات يومية', value: (t) => ltr(`+${extraDailyFor(planOf(t), t)}`) },
    { key: 'visibility', label: 'أولوية الظهور', value: (t) => VERIFICATION_TIER_COPY[t].visibilityShort },
    { key: 'badge', label: 'الشارة', value: (t) => (badgeColorOf(t) === 'gold' ? 'ذهبية' : 'زرقاء') },
    {
      key: 'document',
      label: 'مستند',
      value: (t) => (documentRequiredFor(planOf(t), t) ? 'مطلوب' : 'لا يلزم'),
      accent: 'gold',
    },
  ];

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

        <VerificationHero tier={color} width={heroWidth} />

        <AppText variant="heading2" align="center" style={[styles.text, styles.headline]}>
          {HEADLINE[tier]}
        </AppText>
        <AppText variant="bodySmall" align="center" style={styles.secondary}>
          {copy.audience}
        </AppText>

        {/* Blue / Blue+ / Gold tabs with one sliding underline */}
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
                accessibilityLabel={`${VERIFICATION_TIER_COPY[t].label} — ${VERIFICATION_TIER_COPY[t].name}`}
              >
                <AppText variant="label" style={active ? styles.tabActive : styles.tabIdle}>
                  {ltr(VERIFICATION_TIER_COPY[t].label)}
                </AppText>
              </Pressable>
            );
          })}
          <SwipeTabIndicator
            progress={progress}
            layouts={layouts}
            count={TIERS.length}
            inset={spacing.lg}
            color={D.text}
            thickness={2}
          />
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={D.textSecondary} />
          </View>
        ) : null}

        {/* Quick comparison: plain rows and columns on black (no cards). */}
        <View style={styles.compare} accessibilityLabel="مقارنة الباقات">
          <View style={[styles.compareRow, getRtlRow()]}>
            <View style={styles.compareLabel} />
            {TIERS.map((t) => (
              <Pressable
                key={t}
                onPress={() => setSelected(t)}
                style={styles.compareCell}
                accessibilityRole="button"
                accessibilityState={{ selected: t === tier }}
                accessibilityLabel={`اختر ${VERIFICATION_TIER_COPY[t].label}`}
              >
                <TierBadgeMark tier={badgeColorOf(t)} size={18} outline={t !== tier} outlineColor={D.textSecondary} />
                <AppText variant="caption" style={t === tier ? styles.compareActive : styles.secondary}>
                  {ltr(VERIFICATION_TIER_COPY[t].label)}
                </AppText>
              </Pressable>
            ))}
          </View>
          {compareRows.map((row) => (
            <View key={row.key} style={[styles.compareRow, styles.compareDivider, getRtlRow()]}>
              <AppText variant="caption" style={[styles.secondary, styles.compareLabel]} numberOfLines={2}>
                {row.label}
              </AppText>
              {TIERS.map((t) => {
                const value = row.value(t);
                const accent = row.accent === t && value === 'مطلوب';
                return (
                  <Pressable
                    key={t}
                    onPress={() => setSelected(t)}
                    style={styles.compareCell}
                    accessibilityLabel={`${VERIFICATION_TIER_COPY[t].label}: ${row.label} ${value}`}
                  >
                    <AppText
                      variant="caption"
                      align="center"
                      style={[
                        t === tier ? styles.compareActive : styles.secondary,
                        accent && { color: VERIFIED_BADGE_COLORS.gold },
                      ]}
                    >
                      {value}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {/* Feature list: one rounded dark container */}
        <View style={styles.list}>
          {features.map((f) => (
            <View key={f.label} style={[styles.featureRow, getRtlRow()]}>
              <AppIcon name={f.icon} size={20} color={VERIFIED_BADGE_COLORS[color]} />
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

        {/* Gold: document required before payment */}
        {docRequired ? (
          <View style={[styles.docNotice, getRtlDirection()]}>
            <View style={[styles.docHead, getRtlRow()]}>
              <AppIcon name="document-text-outline" size={20} color={VERIFIED_BADGE_COLORS.gold} />
              <AppText variant="label" style={[styles.text, styles.featureText]}>
                مستند مطلوب قبل الدفع
              </AppText>
            </View>
            <AppText variant="caption" style={styles.secondary}>
              أرفق السجل التجاري مع الهوية وأرسل طلب توثيق التاجر للمراجعة. لا يمكن إتمام دفع Gold بدون
              مستند.
            </AppText>
            {isAuthenticated && status ? (
              <AppText variant="caption" style={goldReady ? styles.text : styles.danger}>
                {goldReady
                  ? `تم إرسال المستند · ${verificationLine}`
                  : (status.goldDocument?.messageAr ?? 'لم يُرفق المستند بعد')}
              </AppText>
            ) : null}
            {tier === 'gold' &&
            verification?.reviewReason &&
            (goldVerificationState === 'rejected' || goldVerificationState === 'needs_amendments') ? (
              <AppText variant="caption" style={styles.danger}>{verification.reviewReason}</AppText>
            ) : null}
            {isAuthenticated && !goldApproved ? (
              <Pressable
                onPress={goDocument}
                accessibilityRole="button"
                style={({ pressed }) => [styles.docLink, pressed && styles.pressed]}
              >
                <AppText variant="label" style={styles.text}>
                  {goldReady ? 'عرض طلب التوثيق' : 'إرفاق المستند'}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Compact status (signed-in) */}
        {isAuthenticated && status ? (
          <View style={styles.status}>
            <View style={[styles.statusRow, getRtlRow()]}>
              <AppText variant="caption" style={styles.secondary}>الاشتراك</AppText>
              <AppText variant="caption" style={[styles.text, styles.statusValue]}>
                {sub?.tier ? `${ltr(VERIFICATION_TIER_COPY[sub.tier].label)} · ` : ''}
                {sub ? subscriptionStateLabelAr(sub) : 'غير مشترك'}
              </AppText>
            </View>
            <View style={[styles.statusRow, getRtlRow()]}>
              <AppText variant="caption" style={styles.secondary}>الشارة</AppText>
              <AppText variant="caption" style={[styles.text, styles.statusValue]}>
                {status.badge.visible
                  ? badgeColorOf(status.badge.color ?? status.badge.tier) === 'gold'
                    ? 'ذهبية · ظاهرة'
                    : 'زرقاء · ظاهرة'
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
          accessibilityLabel={`${copy.label} شهرياً ${price ?? ''}`}
        >
          <Stack gap="xs" style={styles.planText}>
            <AppText variant="label" style={styles.text}>{`${ltr(copy.label)} · شهرياً`}</AppText>
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
          المزايا حتى نهاية الفترة المدفوعة. {ltr('Blue')} و{ltr('Blue+')} بشارة زرقاء ولا تحتاجان أي مستند أو
          تحقق هوية. {ltr('Gold')} يتطلب إرفاق السجل التجاري قبل الدفع، وتظهر الشارة الذهبية بعد قبول توثيق
          التاجر.
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
  compare: { marginTop: spacing.lg },
  compareRow: { alignItems: 'center', minHeight: 40 },
  compareDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: D.border },
  compareLabel: { flex: 1.2, minWidth: 0 },
  compareCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
  },
  compareActive: { color: D.text, fontWeight: '700' },
  docNotice: {
    marginTop: spacing.lg,
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: D.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  docHead: { alignItems: 'center', gap: spacing.sm },
  docLink: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: D.text,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
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
