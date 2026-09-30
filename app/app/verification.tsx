// Sarh — Verification (Blue / Gold badge) subscription page.
// Typographic layout on a white page: no cards, hairline-separated sections.
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { TierBadgeMark } from '@/components/verification/TierBadgeMark';
import { AppText, SarhButton, SarhDivider } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
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

function formatPrice(plan: VerificationPlan | undefined): string {
  if (!plan || !plan.priceConfigured) return 'السعر يُعلن قريباً';
  const amount = Number.isInteger(plan.monthlyPrice)
    ? String(plan.monthlyPrice)
    : plan.monthlyPrice.toFixed(2);
  return `${amount} ر.س / شهرياً`;
}

export default function VerificationScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isAuthenticated, accessToken } = useAuth();
  const { isCompact } = useLayout();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));

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
    }, [load]),
  );

  const tier: VerificationTierId =
    selected ?? status?.subscription.tier ?? status?.verification.approvedTier ?? 'blue';
  const plan = plans.find((p) => p.tier === tier);
  const copy = VERIFICATION_TIER_COPY[tier];
  const sub = status?.subscription;
  const verification = status?.verification;
  const subscribedHere =
    !!sub && sub.tier === tier && (sub.state === 'active' || sub.state === 'canceled');
  const subscribedOther =
    !!sub && !!sub.tier && sub.tier !== tier && (sub.state === 'active' || sub.state === 'canceled');

  const comparison = useMemo(
    () => [
      { label: 'لون الشارة', blue: 'أزرق', gold: 'ذهبي' },
      { label: 'مناسبة لـ', blue: 'الأفراد والبائعين', gold: 'التجار والمحترفين' },
      {
        label: 'إعلانات إضافية يومياً',
        blue: `+${extraDailyFor(plans.find((p) => p.tier === 'blue'), 'blue')}`,
        gold: `+${extraDailyFor(plans.find((p) => p.tier === 'gold'), 'gold')}`,
      },
      { label: 'الظهور في البحث والرئيسية', blue: 'أعلى', gold: 'الأعلى' },
      { label: 'الشارة على الملف والمنشورات والإعلانات والمحادثات', blue: '✓', gold: '✓' },
      { label: 'التحقق المطلوب', blue: 'الهوية الوطنية', gold: 'الهوية + السجل التجاري' },
    ],
    [plans],
  );

  const goVerify = () => {
    router.push({ pathname: '/support/verification', params: { tier } } as never);
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
      'إلغاء التجديد',
      until
        ? `ستبقى الشارة والمزايا فعّالة حتى ${until}، ولن يتجدد الاشتراك بعدها.`
        : 'ستبقى المزايا فعّالة حتى نهاية الفترة المدفوعة.',
      'إلغاء التجديد',
    );
    if (!ok) return;
    setBusy(true);
    const res = await cancelVerificationSubscription();
    setBusy(false);
    if (!res.ok) void alertMessage('تعذّر الإلغاء', res.error);
    void load();
  };

  const verificationLine = (() => {
    if (!verification) return 'لم يبدأ';
    const base = VERIFICATION_STATE_LABEL_AR[verification.state];
    if (verification.state === 'approved' && verification.approvedTier) {
      return `${base} · ${VERIFICATION_TIER_COPY[verification.approvedTier].audience}`;
    }
    return base;
  })();

  const needsVerification =
    !verification ||
    verification.state === 'not_started' ||
    verification.state === 'rejected' ||
    verification.state === 'needs_amendments' ||
    (tier === 'gold' && verification.state === 'approved' && verification.approvedTier !== 'gold');

  const primaryAction = (() => {
    if (!isAuthenticated) {
      return { title: 'سجّل الدخول للاشتراك', onPress: () => router.push('/auth/welcome' as never), disabled: false };
    }
    if (subscribedHere) return null;
    if (!plan?.available) {
      return { title: 'الاشتراك غير متاح بعد', onPress: () => undefined, disabled: true };
    }
    const title = subscribedOther && tier === 'gold'
      ? `الترقية إلى الذهبية · ${formatPrice(plan)}`
      : `اشترك · ${formatPrice(plan)}`;
    return { title, onPress: () => void subscribe(), disabled: subscribedOther && tier === 'blue' };
  })();

  return (
    <Screen edges={['top', 'bottom']} pattern={false} style={styles.screen}>
      <ScreenHeader variant="screen" title="التوثيق" showBack />
      <ScreenBody padTop="lg" padBottom="xxxl" width="form" gap="none">
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroMarks, getRtlRow()]}>
            <TierBadgeMark tier="blue" size={isCompact ? 44 : 52} />
            <TierBadgeMark tier="gold" size={isCompact ? 44 : 52} />
          </View>
          <AppText variant="display" align="center" style={styles.heroTitle}>
            وثّق حسابك في سرح
          </AppText>
          <AppText variant="body" color="textSecondary" align="center" style={styles.heroLead}>
            شارة موثّقة تمنح حسابك وإعلاناتك ثقة أكبر وظهوراً أعلى. تحقّق من هويتك، واشترك شهرياً،
            وتظهر الشارة فور قبول طلبك.
          </AppText>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : null}

        {/* Status */}
        {isAuthenticated && status ? (
          <>
            <SarhDivider />
            <View style={styles.section}>
              <AppText variant="caption" color="textMuted" style={styles.eyebrow}>
                حالتك
              </AppText>
              <View style={[styles.statusRow, getRtlRow()]}>
                <AppText variant="bodySmall" color="textSecondary">التحقق</AppText>
                <AppText variant="label" style={styles.statusValue}>{verificationLine}</AppText>
              </View>
              {verification?.reviewReason &&
              (verification.state === 'rejected' || verification.state === 'needs_amendments') ? (
                <AppText variant="caption" color="danger" style={styles.reason}>
                  {verification.reviewReason}
                </AppText>
              ) : null}
              <View style={[styles.statusRow, getRtlRow()]}>
                <AppText variant="bodySmall" color="textSecondary">الاشتراك</AppText>
                <AppText variant="label" style={styles.statusValue}>
                  {sub?.tier ? `${VERIFICATION_TIER_COPY[sub.tier].name} · ` : ''}
                  {sub ? subscriptionStateLabelAr(sub) : 'غير مشترك'}
                </AppText>
              </View>
              <View style={[styles.statusRow, getRtlRow()]}>
                <AppText variant="bodySmall" color="textSecondary">الشارة</AppText>
                <View style={[styles.badgeValue, getRtlRow()]}>
                  {status.badge.visible && status.badge.tier ? (
                    <TierBadgeMark tier={status.badge.tier} size={18} />
                  ) : null}
                  <AppText variant="label" style={styles.statusValue}>
                    {status.badge.visible
                      ? status.badge.tier === 'gold'
                        ? 'ذهبية · ظاهرة'
                        : 'زرقاء · ظاهرة'
                      : 'غير ظاهرة'}
                  </AppText>
                </View>
              </View>
            </View>
          </>
        ) : null}

        {/* Plan selector */}
        <SarhDivider />
        <View style={styles.section}>
          <AppText variant="caption" color="textMuted" style={styles.eyebrow}>
            اختر الشارة
          </AppText>
          <View style={[styles.tabs, getRtlRow()]} accessibilityRole="tablist">
            {TIERS.map((t) => {
              const active = t === tier;
              return (
                <Pressable
                  key={t}
                  onPress={() => setSelected(t)}
                  style={[styles.tab, active && { borderBottomColor: VERIFIED_BADGE_COLORS[t] }]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={VERIFICATION_TIER_COPY[t].name}
                >
                  <View style={[styles.tabInner, getRtlRow()]}>
                    <TierBadgeMark tier={t} size={20} outline={!active} outlineColor={colors.textMuted} />
                    <AppText variant="label" color={active ? 'textPrimary' : 'textMuted'}>
                      {VERIFICATION_TIER_COPY[t].name}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.planHead, getRtlRow()]}>
            <TierBadgeMark tier={tier} size={isCompact ? 56 : 64} />
            <Stack gap="xs" style={styles.planHeadText}>
              <AppText variant="heading1">{copy.name}</AppText>
              <AppText variant="bodySmall" color="textSecondary">{copy.audience}</AppText>
            </Stack>
          </View>

          <View style={styles.priceBlock}>
            <AppText variant="heading2">{formatPrice(plan)}</AppText>
            <AppText variant="caption" color="textMuted">
              اشتراك شهري متجدد · يمكنك إلغاء التجديد في أي وقت وتبقى المزايا حتى نهاية الفترة المدفوعة
            </AppText>
          </View>

          <View style={styles.benefits}>
            {[
              `شارة توثيق ${tier === 'gold' ? 'ذهبية' : 'زرقاء'} بجانب اسمك`,
              copy.visibility,
              `+${extraDailyFor(plan, tier)} إعلانات إضافية يومياً فوق الحد الأساسي`,
              'تظهر الشارة في ملفك ومنشوراتك وإعلاناتك ومحادثاتك',
              'المزايا مرتبطة باشتراكك الفعّال',
            ].map((line) => (
              <View key={line} style={[styles.benefitRow, getRtlRow()]}>
                <AppIcon name="checkmark" size={18} color={VERIFIED_BADGE_COLORS[tier]} />
                <AppText variant="body" style={styles.benefitText}>{line}</AppText>
              </View>
            ))}
          </View>

          <Stack gap="sm" style={styles.actions}>
            {primaryAction ? (
              <SarhButton
                title={primaryAction.title}
                fullWidth
                loading={busy}
                disabled={primaryAction.disabled || busy}
                onPress={primaryAction.onPress}
              />
            ) : null}
            {subscribedHere && sub?.state === 'active' ? (
              <SarhButton
                title="إلغاء التجديد"
                variant="ghost"
                fullWidth
                disabled={busy}
                onPress={() => void cancelRenewal()}
              />
            ) : null}
            {subscribedHere && sub?.state === 'canceled' ? (
              <AppText variant="caption" color="textMuted" align="center">
                ألغيت التجديد. تبقى الشارة والمزايا حتى {formatArabicDate(sub.renewDate)}.
              </AppText>
            ) : null}
            {subscribedOther && tier === 'blue' ? (
              <AppText variant="caption" color="textMuted" align="center">
                لديك اشتراك في الشارة الذهبية. يمكنك الانتقال إلى الزرقاء بعد انتهاء الفترة الحالية.
              </AppText>
            ) : null}
            {isAuthenticated && !plan?.available ? (
              <AppText variant="caption" color="textMuted" align="center">
                سيتاح الاشتراك فور اعتماد الأسعار. يمكنك البدء بطلب التحقق الآن.
              </AppText>
            ) : null}
            {isAuthenticated && needsVerification && verification?.state !== 'pending_review' ? (
              <SarhButton
                title={
                  tier === 'gold' ? 'ابدأ التحقق كتاجر' : 'ابدأ التحقق'
                }
                variant="secondary"
                fullWidth
                onPress={goVerify}
              />
            ) : null}
            {verification?.state === 'pending_review' ? (
              <AppText variant="caption" color="textMuted" align="center">
                طلب التحقق قيد المراجعة، وسنُشعرك بالنتيجة.
              </AppText>
            ) : null}
          </Stack>
        </View>

        {/* Comparison */}
        <SarhDivider />
        <View style={styles.section}>
          <AppText variant="heading3" style={styles.sectionTitle}>المقارنة</AppText>
          <View style={[styles.compareRow, getRtlRow()]}>
            <View style={styles.compareLabel} />
            {TIERS.map((t) => (
              <View key={t} style={styles.compareCell}>
                <TierBadgeMark tier={t} size={22} />
              </View>
            ))}
          </View>
          {comparison.map((row) => (
            <View key={row.label} style={[styles.compareRow, styles.compareLine, getRtlRow()]}>
              <AppText variant="bodySmall" color="textSecondary" style={styles.compareLabel}>
                {row.label}
              </AppText>
              <AppText variant="label" align="center" style={styles.compareCell}>{row.blue}</AppText>
              <AppText variant="label" align="center" style={styles.compareCell}>{row.gold}</AppText>
            </View>
          ))}
        </View>

        {/* How it works */}
        <SarhDivider />
        <View style={styles.section}>
          <AppText variant="heading3" style={styles.sectionTitle}>كيف يعمل التوثيق</AppText>
          {[
            { n: '١', title: 'قدّم طلب التحقق', body: 'الأفراد: الهوية الوطنية. التجار: بيانات المنشأة والسجل التجاري.' },
            { n: '٢', title: 'اشترك شهرياً', body: 'ادفع عبر بوابة الدفع الآمنة في سرح. يمكنك إلغاء التجديد متى شئت.' },
            { n: '٣', title: 'تظهر الشارة', body: 'بعد قبول الطلب ومع اشتراك فعّال، وتختفي عند انتهاء الاشتراك.' },
          ].map((step) => (
            <View key={step.n} style={[styles.step, getRtlRow()]}>
              <AppText variant="heading2" color="primary" style={styles.stepNumber}>{step.n}</AppText>
              <Stack gap="xs" style={styles.stepText}>
                <AppText variant="label">{step.title}</AppText>
                <AppText variant="bodySmall" color="textSecondary">{step.body}</AppText>
              </Stack>
            </View>
          ))}
        </View>

        <SarhDivider />
        <AppText variant="caption" color="textMuted" align="center" style={styles.footnote}>
          الشارة لا تُشترى وحدها: تظهر فقط عند قبول طلب التحقق مع اشتراك فعّال.
        </AppText>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { backgroundColor: colors.screenRoot },
    hero: {
      alignItems: 'center',
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    heroMarks: { gap: spacing.md, alignItems: 'center', marginBottom: spacing.sm },
    heroTitle: { letterSpacing: -0.2 },
    heroLead: { maxWidth: 460 },
    loading: { paddingVertical: spacing.lg, alignItems: 'center' },
    section: { paddingVertical: spacing.xl, gap: spacing.md },
    sectionTitle: { marginBottom: spacing.xs },
    eyebrow: { letterSpacing: 0.4 },
    statusRow: {
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 32,
    },
    statusValue: { flexShrink: 1, textAlign: 'auto' },
    badgeValue: { alignItems: 'center', gap: 6, flexShrink: 1 },
    reason: { lineHeight: 18 },
    tabs: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSoft,
    },
    tab: {
      flex: 1,
      paddingVertical: spacing.md,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
      marginBottom: -StyleSheet.hairlineWidth,
      alignItems: 'center',
    },
    tabInner: { alignItems: 'center', gap: spacing.sm },
    planHead: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.md },
    planHeadText: { flex: 1, minWidth: 0 },
    priceBlock: { gap: 4 },
    benefits: { gap: spacing.md, paddingTop: spacing.xs },
    benefitRow: { alignItems: 'flex-start', gap: spacing.md },
    benefitText: { flex: 1, minWidth: 0 },
    actions: { paddingTop: spacing.md },
    compareRow: { alignItems: 'center', gap: spacing.sm, minHeight: 44 },
    compareLine: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSoft,
      paddingVertical: spacing.sm,
    },
    compareLabel: { flex: 1.4, minWidth: 0 },
    compareCell: { flex: 1, alignItems: 'center' },
    step: { gap: spacing.lg, alignItems: 'flex-start', paddingVertical: spacing.xs },
    stepNumber: { width: 28, textAlign: 'center' },
    stepText: { flex: 1, minWidth: 0 },
    footnote: { paddingVertical: spacing.xl },
  });
}
