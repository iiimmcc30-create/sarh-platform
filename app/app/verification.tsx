// Sarh — Verification (Blue / Blue+ / Gold) subscribe sheet.
// Layout follows the approved X-Premium-style mobile sheet: close, hero badge,
// headline, Blue/Blue+/Gold tabs, one rounded
// feature list, the monthly plan, a pill CTA and fine print. The page is
// ALWAYS dark (black) in light and dark mode. Website: prices from the plans
// API, N-Genius checkout, manual renewal. iOS / Android apps: Apple IAP /
// Google Play auto-renewable subscriptions (services/iap.ts) with the
// store-localized price, «استعادة المشتريات» and the auto-renew disclosure.
// Gold needs a document before payment (the API enforces it too). Accounts that never subscribed can start
// a one-week free Blue+ trial here (no card, no payment, ends by itself).
import { DigitalPurchasesUnavailable } from '@/components/feature/DigitalPurchasesUnavailable';
import { digitalPurchasesEnabled, usesStoreBilling } from '@/lib/storePurchases';
import { STORE_PRODUCTS, subscriptionProductForTier } from '@/lib/storeProducts';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
import { getRtlDirection, getRtlRow } from '@/lib/rtl';
import { VERIFIED_BADGE_COLORS } from '@/lib/verifiedBadge';
import { invalidateFreeTrialEligibility } from '@/hooks/useFreeTrialEligibility';
import { launchPaymentCheckout } from '@/services/payments';
import {
  getOwnedStoreSubscriptions,
  openStoreSubscriptionManagement,
  openStoreSubscriptionManagementFor,
  purchaseStoreProduct,
  restoreStorePurchases,
  storeName,
  type StorePurchaseOutcome,
} from '@/services/iap';
import { useStorePrices } from '@/hooks/useStorePrices';
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
  isStoreBillingSource,
  startFreeTrial,
  subscriptionStateLabelAr,
  tierRank,
  trialElapsedRatio,
  trialStatusLabelAr,
  type VerificationPlan,
  type VerificationStatus,
  type VerificationTierId,
  weeklyFreeBoostsFor,
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

const STORE_SUBSCRIPTION_IDS = STORE_PRODUCTS.filter((p) => p.storeType === 'subs').map((p) => p.productId);

type OwnedStoreSub = { productId: string; purchaseToken: string | null };

const HEADLINE: Record<VerificationTierId, string> = {
  blue: 'وثّق حسابك بالشارة الزرقاء',
  blue_plus: `ارفع ظهورك مع ${ltr('Blue+')}`,
  gold: 'الشارة الذهبية للتجار الموثّقين',
};

/** «تمييزان» / «4 تمييزات» (Arabic dual). */
function boostsCountAr(n: number): string {
  if (n === 1) return 'تمييز مجاني واحد';
  if (n === 2) return 'تمييزان مجانيان';
  return `${ltr(String(n))} تمييزات مجانية`;
}

/** Real benefits only (all enforced by the backend today). */
function featuresFor(tier: VerificationTierId, plan: VerificationPlan | undefined): Feature[] {
  const extra = extraDailyFor(plan, tier);
  const weeklyBoosts = weeklyFreeBoostsFor(plan, tier);
  const profileViews: Feature = {
    icon: 'eye-outline',
    label: 'من شاهد ملفك',
    info: 'أسماء زوار ملفك ووقت الزيارة خلال آخر 30 يوماً.',
  };
  const freeBoosts: Feature | null =
    weeklyBoosts > 0
      ? {
          icon: 'rocket-outline',
          label: `${boostsCountAr(weeklyBoosts)} كل أسبوع`,
          info: 'تمييز أي إعلان من إعلاناتك لمدة 24 ساعة بدون دفع، ويتجدد الرصيد كل 7 أيام.',
        }
      : null;
  const councilsSchedule: Feature = {
    icon: 'mic',
    label: tier === 'gold' ? 'جدولة المجالس، ومجالس للمتابعين فقط، و«عرض صورة»' : 'جدولة المجالس مسبقاً',
    ...(tier === 'gold'
      ? { info: '«عرض صورة» في مجلسك: صورة من إعلاناتك أو من المعرض تظهر لجميع الحاضرين.' }
      : null),
  };
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
      {
        icon: 'ribbon',
        label: '«بائع ذهبي» تحت اسمك',
        info: 'وصف «بائع ذهبي» يظهر مع اسمك في الإعلانات والملف بعد قبول توثيق التاجر.',
      },
      {
        icon: 'location-outline',
        label: 'إعلاناتك أولاً في منطقتك',
        info: 'عند البحث في منطقة محددة تظهر إعلانات البائعين الذهبيين قبل غيرهم.',
      },
      daily,
      ...(freeBoosts ? [freeBoosts] : []),
      profileViews,
      councilsSchedule,
      {
        icon: 'lifebuoy',
        label: 'دعم فني بأولوية',
        info: 'تذاكر الدعم من حسابك تصل للفريق بأولوية عالية.',
      },
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
      ...(freeBoosts ? [freeBoosts] : []),
      profileViews,
      councilsSchedule,
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
    ...(freeBoosts ? [freeBoosts] : []),
    profileViews,
    shown,
    noDocs,
    active,
  ];
}

/**
 * Free-trial card: the offer (eligible) or the running trial with a thin
 * progress track. Flat dark surface, hairline border, no shadow/gradient.
 */
function TrialCard({
  mode,
  durationDays,
  daysLeftLabel,
  endsOn,
  elapsed,
}: {
  mode: 'offer' | 'active';
  durationDays: number;
  daysLeftLabel: string;
  endsOn: string;
  elapsed: number;
}) {
  const [appear] = useState(() => new Animated.Value(0));
  const [fill] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: duration.ui, useNativeDriver: true }).start();
  }, [appear]);
  useEffect(() => {
    Animated.timing(fill, { toValue: elapsed, duration: duration.ui * 2, useNativeDriver: false }).start();
  }, [fill, elapsed]);

  const lines =
    mode === 'offer'
      ? ['بدون بطاقة وبدون أي دفع', `تنتهي تلقائياً بعد ${durationDays} أيام، بلا تجديد`, 'مرة واحدة لكل حساب']
      : [];

  return (
    <Animated.View
      style={[
        styles.trialCard,
        getRtlDirection(),
        {
          opacity: appear,
          transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
        },
      ]}
      accessibilityRole="summary"
    >
      <View style={[styles.trialHead, getRtlRow()]}>
        <View style={styles.trialIcon}>
          <AppIcon name={mode === 'offer' ? 'gift-outline' : 'time-outline'} size={18} color={D.text} />
        </View>
        <Stack gap="none" style={styles.featureText}>
          <AppText variant="label" style={[styles.text, styles.trialTitle]}>
            {mode === 'offer' ? `أسبوع مجاني من ${ltr('Blue+')}` : daysLeftLabel}
          </AppText>
          <AppText variant="caption" style={styles.secondary}>
            {mode === 'offer' ? 'جرّب كل المزايا قبل أن تدفع' : `تنتهي في ${endsOn}`}
          </AppText>
        </Stack>
      </View>
      {mode === 'offer' ? (
        <View style={styles.trialLines}>
          {lines.map((line) => (
            <View key={line} style={[styles.trialLine, getRtlRow()]}>
              <AppIcon name="checkmark" size={16} color={VERIFIED_BADGE_COLORS.blue} />
              <AppText variant="caption" style={[styles.text, styles.featureText]}>{line}</AppText>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.trialTrack} accessibilityLabel={daysLeftLabel}>
          <Animated.View
            style={[
              styles.trialFill,
              { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
            ]}
          />
        </View>
      )}
    </Animated.View>
  );
}

function VerificationScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { isAuthenticated, accessToken, user } = useAuth();
  const { isCompact } = useLayout();
  // iOS / Android: Apple IAP / Google Play Billing only (no external checkout).
  const storeBilling = usesStoreBilling();
  const store = storeName();
  const { prices: storePrices } = useStorePrices(storeBilling ? STORE_SUBSCRIPTION_IDS : []);
  const [ownedStoreSubs, setOwnedStoreSubs] = useState<OwnedStoreSub[]>([]);

  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [plans, setPlans] = useState<VerificationPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // «ترقية إلى Gold» / trial rows in the «التوثيق» hub open a given tab.
  const params = useLocalSearchParams<{ tier?: string }>();
  const initialTier =
    params.tier === 'blue' || params.tier === 'blue_plus' || params.tier === 'gold' ? params.tier : null;
  const [selected, setSelected] = useState<VerificationTierId | null>(initialTier);

  const load = useCallback(async () => {
    if (isAuthenticated) {
      const data = await fetchVerificationStatus();
      setStatus(data);
      if (data) setPlans(data.plans);
      if (storeBilling) {
        const owned = await getOwnedStoreSubscriptions();
        setOwnedStoreSubs(owned.map((p) => ({ productId: p.productId, purchaseToken: p.purchaseToken ?? null })));
      }
    } else {
      setStatus(null);
      setPlans(await fetchVerificationPlans());
    }
    setLoading(false);
  }, [isAuthenticated, storeBilling]);

  useFocusEffect(
    useCallback(() => {
      void load();
      // Black page in both themes: light status-bar content while focused.
      setStatusBarStyle('light');
      return () => setStatusBarStyle(isDark ? 'light' : 'dark');
    }, [load, isDark]),
  );

  const trial = isAuthenticated ? status?.trial : undefined;
  const trialEligible = !!trial?.eligible;
  const trialActive = !!trial?.active || !!status?.subscription.isTrial;
  const tier: VerificationTierId =
    selected ?? status?.subscription.tier ?? (trialEligible ? 'blue_plus' : 'blue');
  const tierIndex = TIERS.indexOf(tier);
  const planOf = (t: VerificationTierId) => plans.find((p) => p.tier === t);
  const plan = planOf(tier);
  const copy = VERIFICATION_TIER_COPY[tier];
  const color = badgeColorOf(tier);
  const sub = status?.subscription;
  const verification = status?.verification;
  // A running free trial is not a paid period: every plan stays purchasable
  // (the paid month starts where the trial ends).
  const subActive = !!sub && !trialActive && (sub.state === 'active' || sub.state === 'canceled');
  const subscribedHere = subActive && sub?.tier === tier;
  const subscribedHigher = subActive && tierRank(sub?.tier) > tierIndex;
  const subscribedLower = subActive && !!sub?.tier && tierRank(sub.tier) < tierIndex;
  const renewing =
    !!sub && !trialActive && sub.tier === tier && (sub.state === 'grace_period' || sub.state === 'expired');
  const trialTab = tier === 'blue_plus';
  const trialDaysLabel = trial ? trialStatusLabelAr(trial) : '';
  const storeProductId = subscriptionProductForTier(tier).productId;
  const price = storeBilling ? (storePrices[storeProductId]?.displayPrice ?? null) : priceAmount(plan);
  const ownedSubFor = (t: VerificationTierId | null | undefined) =>
    t ? ownedStoreSubs.find((o) => o.productId === subscriptionProductForTier(t).productId) : undefined;
  // Paid through App Store / Google Play (renews automatically; managed in the
  // store, never the N-Genius cancel). The API's billing.source is the truth on
  // every platform; the on-device purchase list covers older API builds.
  const billingSource = status?.billing?.source;
  const storeSource = isStoreBillingSource(billingSource) ? billingSource : null;
  const storeBilledHere = !!storeSource || (storeBilling && !!ownedSubFor(sub?.tier));
  const manageStoreName = storeSource === 'app_store' ? 'App Store' : storeSource === 'google_play' ? 'Google Play' : store;
  const openManage = () => {
    const productId = ownedSubFor(sub?.tier)?.productId ?? (sub?.tier ? subscriptionProductForTier(sub.tier).productId : undefined);
    if (storeSource) void openStoreSubscriptionManagementFor(storeSource, productId);
    else void openStoreSubscriptionManagement(productId);
  };

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

  const showStoreOutcome = (outcome: StorePurchaseOutcome) => {
    if (outcome.kind === 'cancelled') return;
    if (outcome.kind === 'granted') {
      void alertMessage(
        'تم الاشتراك',
        tier === 'gold' && !goldApproved
          ? 'تم تفعيل مزايا Gold. تظهر الشارة الذهبية بعد قبول توثيق التاجر.'
          : `تم تفعيل اشتراك ${ltr(copy.label)}. يتجدد تلقائياً عبر ${store} ويمكنك إلغاؤه من إعدادات الاشتراكات.`,
      );
      return;
    }
    const title =
      outcome.kind === 'pending'
        ? 'بانتظار إتمام الدفع'
        : outcome.kind === 'verify_failed'
          ? 'جارٍ تأكيد الشراء'
          : outcome.kind === 'already_owned'
            ? 'مشترك بالفعل'
            : 'تعذّر الاشتراك';
    void alertMessage(title, outcome.message);
  };

  /** Native: App Store / Google Play auto-renewable subscription. */
  const subscribeWithStore = async () => {
    if (!user?.id) return;
    const current = ownedSubFor(sub?.tier);
    const replace =
      Platform.OS === 'android' && current?.purchaseToken && current.productId !== storeProductId
        ? { oldProductId: current.productId, purchaseToken: current.purchaseToken }
        : null;
    setBusy(true);
    const outcome = await purchaseStoreProduct({ productId: storeProductId, userId: user.id, replace });
    setBusy(false);
    showStoreOutcome(outcome);
    void load();
  };

  /** «استعادة المشتريات» (required by App Review for subscriptions). */
  const restore = async () => {
    if (!isAuthenticated) {
      router.push('/auth/phone');
      return;
    }
    setBusy(true);
    const res = await restoreStorePurchases();
    setBusy(false);
    if (!res.available) {
      void alertMessage('استعادة المشتريات', 'الشراء داخل التطبيق غير متاح على هذا الجهاز حالياً.');
    } else if (res.restored > 0) {
      void alertMessage('تمت الاستعادة', 'تمت استعادة اشتراكك وربطه بحسابك في سرح.');
    } else if (res.failed > 0) {
      void alertMessage('تعذّرت الاستعادة', `الاشتراك في حساب ${store} هذا مرتبط بحساب آخر في سرح أو تعذّر تأكيده.`);
    } else {
      void alertMessage('استعادة المشتريات', `لا توجد اشتراكات فعّالة في حساب ${store} هذا.`);
    }
    void load();
  };

  const subscribe = async () => {
    if (!isAuthenticated || !accessToken) {
      router.push('/auth/phone');
      return;
    }
    if (storeBilling) {
      if (!plan?.available) return;
      await subscribeWithStore();
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

  /** One tap, no card: Blue+ for a week (the API checks eligibility). */
  const startTrial = async () => {
    if (!isAuthenticated || !accessToken) {
      router.push('/auth/phone');
      return;
    }
    setBusy(true);
    const res = await startFreeTrial();
    setBusy(false);
    invalidateFreeTrialEligibility();
    if (!res.ok) {
      void alertMessage('تعذّر بدء التجربة', res.error);
      void load();
      return;
    }
    const until = formatArabicDate(res.trial?.endsAt);
    void alertMessage(
      'بدأت تجربتك المجانية',
      until
        ? `مزايا ${ltr('Blue+')} والشارة الزرقاء فعّالة الآن حتى ${until}. لن نخصم أي مبلغ.`
        : `مزايا ${ltr('Blue+')} والشارة الزرقاء فعّالة الآن. لن نخصم أي مبلغ.`,
    );
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
    if (!res.ok) {
      void alertMessage(res.code === 'manage_in_store' ? 'إدارة الاشتراك من المتجر' : 'تعذّر الإلغاء', res.error);
    }
    void load();
  };

  const cta = ((): { title: string; onPress: () => void; disabled: boolean } => {
    const none = () => undefined;
    if (!isAuthenticated) {
      return { title: 'سجّل الدخول للاشتراك', onPress: () => router.push('/auth/phone'), disabled: false };
    }
    if (trialEligible && trialTab) {
      return {
        title: `جرّب ${ltr('Blue+')} مجانًا لمدة أسبوع`,
        onPress: () => void startTrial(),
        disabled: false,
      };
    }
    if (trialActive && trialTab && plan?.available) {
      return {
        title: `اشترك في ${ltr('Blue+')} للاستمرار`,
        onPress: () => void subscribe(),
        disabled: false,
      };
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
    if (trialEligible && trialTab) {
      return `مجاناً لمدة ${trial?.durationDays ?? 7} أيام بدون بطاقة ولا أي خصم، وتعود للباقة المجانية تلقائياً بعد انتهائها.`;
    }
    if (trialActive && trialTab) {
      return storeBilling
        ? `يبدأ اشتراكك المدفوع فور الشراء عبر ${store}.`
        : 'يبدأ اشتراكك المدفوع بعد نهاية التجربة، فلا تخسر أي يوم منها.';
    }
    if (subscribedHere && sub?.state === 'active' && storeBilledHere) {
      return `يتجدد اشتراكك تلقائياً في ${formatArabicDate(status?.billing?.expiresAt ?? sub.renewDate)} عبر ${manageStoreName}.`;
    }
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
    if (storeBilling) {
      return price
        ? `${price} شهرياً عبر ${store}، ويتجدد تلقائياً حتى تلغيه.`
        : `اشتراك شهري عبر ${store} يتجدد تلقائياً حتى تلغيه.`;
    }
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

        {/* Free trial: the offer on the Blue+ tab, or the running trial */}
        {trialActive && trial ? (
          <TrialCard
            mode="active"
            durationDays={trial.durationDays}
            daysLeftLabel={trialDaysLabel}
            endsOn={formatArabicDate(trial.endsAt ?? sub?.renewDate)}
            elapsed={trialElapsedRatio(trial)}
          />
        ) : trialEligible && trial && trialTab ? (
          <TrialCard
            mode="offer"
            durationDays={trial.durationDays}
            daysLeftLabel=""
            endsOn=""
            elapsed={0}
          />
        ) : trialEligible ? (
          <Pressable
            onPress={() => setSelected('blue_plus')}
            accessibilityRole="button"
            accessibilityLabel={`جرّب ${ltr('Blue+')} مجانًا لمدة أسبوع`}
            style={({ pressed }) => [styles.trialHint, getRtlRow(), pressed && styles.pressed]}
          >
            <AppIcon name="gift-outline" size={16} color={D.text} />
            <AppText variant="caption" style={[styles.text, styles.featureText]}>
              {`جرّب ${ltr('Blue+')} مجانًا لمدة أسبوع`}
            </AppText>
            <AppIcon name="chevron-back" size={16} color={D.textSecondary} />
          </Pressable>
        ) : null}

        {/* Compact status (signed-in) */}
        {isAuthenticated && status ? (
          <View style={styles.status}>
            <View style={[styles.statusRow, getRtlRow()]}>
              <AppText variant="caption" style={styles.secondary}>الاشتراك</AppText>
              <AppText variant="caption" style={[styles.text, styles.statusValue]}>
                {sub?.tier ? `${ltr(VERIFICATION_TIER_COPY[sub.tier].label)} · ` : ''}
                {trialActive && trial ? trialDaysLabel : sub ? subscriptionStateLabelAr(sub) : 'غير مشترك'}
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
            <AppText variant="caption" style={styles.secondary}>
              {storeBilling ? 'يتجدد تلقائياً كل شهر' : 'تجديد يدوي كل شهر'}
            </AppText>
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
        {trialEligible && trialTab && plan?.available ? (
          <Pressable
            onPress={() => void subscribe()}
            disabled={busy}
            accessibilityRole="button"
            style={styles.cancel}
          >
            <AppText variant="caption" align="center" style={styles.text}>
              أو اشترك الآن مباشرة
            </AppText>
          </Pressable>
        ) : null}
        {subscribedHere && storeBilledHere ? (
          <Pressable
            onPress={openManage}
            disabled={busy}
            accessibilityRole="button"
            style={styles.cancel}
          >
            <AppText variant="caption" align="center" style={styles.text}>
              {`إدارة الاشتراك أو إلغاؤه في ${manageStoreName}`}
            </AppText>
          </Pressable>
        ) : subscribedHere && sub?.state === 'active' ? (
          <Pressable
            onPress={() => void cancelRenewal()}
            disabled={busy}
            accessibilityRole="button"
            style={styles.cancel}
          >
            <AppText variant="caption" align="center" style={styles.danger}>إلغاء الاشتراك</AppText>
          </Pressable>
        ) : null}

        {storeBilling ? (
          <View style={[styles.storeLinks, getRtlRow()]}>
            <Pressable onPress={() => void restore()} disabled={busy} accessibilityRole="button" hitSlop={8}>
              <AppText variant="caption" style={styles.text}>استعادة المشتريات</AppText>
            </Pressable>
            <AppText variant="caption" style={styles.secondary}>·</AppText>
            <Pressable onPress={() => router.push('/info/terms' as never)} accessibilityRole="link" hitSlop={8}>
              <AppText variant="caption" style={styles.text}>شروط الاستخدام</AppText>
            </Pressable>
            <AppText variant="caption" style={styles.secondary}>·</AppText>
            <Pressable onPress={() => router.push('/info/privacy' as never)} accessibilityRole="link" hitSlop={8}>
              <AppText variant="caption" style={styles.text}>سياسة الخصوصية</AppText>
            </Pressable>
          </View>
        ) : null}

        {/* Fine print */}
        {storeBilling ? (
          <AppText variant="caption" style={[styles.secondary, styles.finePrint]}>
            {`اشتراك ${ltr(copy.label)} شهري${price ? ` بسعر ${price} شهرياً` : ''}، ويتجدد تلقائياً كل شهر بنفس السعر. `}
            {`يُخصم المبلغ من حسابك في ${store} عند تأكيد الشراء وعند كل تجديد، ما لم يُلغَ التجديد التلقائي قبل 24 ساعة على الأقل من نهاية الفترة الحالية. `}
            {`يمكنك إدارة الاشتراك أو إلغاؤه في أي وقت من إعدادات حسابك في ${store}، وتبقى المزايا حتى نهاية الفترة المدفوعة. `}
            {`بالاشتراك فإنك توافق على شروط الاستخدام وسياسة الخصوصية في سرح. `}
            {`التجربة المجانية لـ ${ltr('Blue+')} أسبوع واحد ومرة واحدة لكل حساب لم يسبق له الاشتراك، بلا أي خصم، وتنتهي وحدها. `}
            {`${ltr('Gold')} يتطلب إرفاق السجل التجاري قبل الشراء، وتظهر الشارة الذهبية بعد قبول توثيق التاجر.`}
          </AppText>
        ) : (
          <AppText variant="caption" style={[styles.secondary, styles.finePrint]}>
            بالاشتراك، فإنك توافق على شروط الاستخدام في سرح. الاشتراك شهري ويُجدَّد يدوياً فقط: لا نحفظ
            بطاقتك ولا نخصم أي مبلغ تلقائياً. نذكّرك قبل موعد التجديد بـ 7 أيام و3 أيام ويوم واحد وفي يوم
            التجديد، ولديك مهلة 3 أيام بعده قبل إيقاف المزايا والشارة. يمكنك إلغاء الاشتراك في أي وقت وتبقى
            المزايا حتى نهاية الفترة المدفوعة. التجربة المجانية لـ {ltr('Blue+')} أسبوع واحد ومرة واحدة لكل حساب
            لم يسبق له الاشتراك، بدون بطاقة ولا أي خصم، وتنتهي وحدها. {ltr('Blue')} و{ltr('Blue+')} بشارة زرقاء ولا تحتاجان أي مستند أو
            تحقق هوية. {ltr('Gold')} يتطلب إرفاق السجل التجاري قبل الدفع، وتظهر الشارة الذهبية بعد قبول توثيق
            التاجر.
          </AppText>
        )}
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
  storeLinks: {
    marginTop: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  trialCard: {
    marginTop: spacing.lg,
    gap: spacing.md,
    backgroundColor: D.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: D.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  trialHead: { alignItems: 'center', gap: spacing.md },
  trialIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: D.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trialTitle: { fontWeight: '700' },
  trialLines: { gap: spacing.xs },
  trialLine: { alignItems: 'center', gap: spacing.sm, minHeight: 22 },
  trialTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: D.border,
    overflow: 'hidden',
  },
  trialFill: { height: 4, borderRadius: radius.pill, backgroundColor: VERIFIED_BADGE_COLORS.blue },
  trialHint: {
    marginTop: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: D.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  finePrint: {
    marginTop: spacing.xl,
    lineHeight: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: D.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});

/** Store builds hide digital purchases (lib/storePurchases.ts) — deep links land on «غير متاحة حالياً». */
export default function VerificationRoute() {
  if (!digitalPurchasesEnabled()) return <DigitalPurchasesUnavailable title="التوثيق" />;
  return <VerificationScreen />;
}
