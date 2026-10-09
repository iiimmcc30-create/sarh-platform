// Sarh — Promote a listing (Featured / Pinned / Visibility).
// Premium, black-and-white layout: a hero with the seller's own card previewed
// exactly as it will look boosted, honest benefit bullets, selectable plan
// cards (price, per-day price and saving derived from the catalog), the free
// weekly boost for Blue+/Gold and a sticky total + «عزّز الآن» pill.
// Prices/durations come only from the official catalog; the server charges
// from the same table. Payment still goes through initiatePromotePayment →
// launchPaymentCheckout (unchanged).
import { DigitalPurchasesUnavailable } from '@/components/feature/DigitalPurchasesUnavailable';
import { digitalPurchasesEnabled } from '@/lib/storePurchases';
import { ListingCard } from '@/components/feature/ListingCard';
import { FreeBoostOption } from '@/components/listing/FreeBoostOption';
import { PaymentBrandLogo, FEE_PAYMENT_METHODS } from '@/components/payment/PaymentBrandLogos';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { duration } from '@/design-system/tokens';
import { launchPaymentCheckout } from '@/services/payments';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import type { Listing } from '@/services/types';
import {
  isListingFeaturedActive,
  isListingPinnedActive,
  isListingPromotedActive,
} from '@/lib/listingBoostState';
import {
  buildPromoteCheckoutPayload,
  fetchPromoteQuote,
  goalFromBoostType,
  initiatePromotePayment,
  type PromotionGoal,
} from '@/services/listingPromote';
import { listPromoteCatalogOptions } from '@/services/promoteCatalog';
import { fetchPromotionStats, type PromotionStats } from '@/services/listingPromotion';
import type { FreeBoostQuota } from '@/services/freeBoost';
import { usePaidServices } from '@/hooks/usePaidServices';
import { firstEnabledPromoteGoal, isPromoteGoalEnabled } from '@/services/paidServices';
import {
  FREE_BOOST_UPSELL_AR,
  PROMOTE_BENEFITS,
  PROMOTE_BEST_VALUE_BADGE,
  PROMOTE_HERO_LINE,
  PROMOTE_SERVICE_COPY,
  buildPromotePlans,
  createSubmitGuard,
  formatSar,
  hasPromotionStats,
  promoteCheckoutOutcomeMessage,
  promoteCommonBenefits,
  promoteCtaLabel,
  promotePaymentErrorMessage,
  shouldShowFreeBoostUpsell,
  type PromoteBenefit,
  type PromotePlanView,
} from '@/lib/promotePage';
import { router, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import { AppText, SarhButton } from '@/design-system/components';
import { BottomAction, Row, Screen, ScreenBody, Section, Stack } from '@/design-system/layout';

type Selection = { goal: PromotionGoal; durationHours: number };
type Notice = { tone: 'error' | 'info'; text: string };
type Success = { title: string; text: string };
type LoadState = 'loading' | 'ready' | 'error';
type Styles = ReturnType<typeof createStyles>;

const TITLE = 'عزّز إعلانك';
const SUBTITLE = 'اختر طريقة لإبراز إعلانك. الدفع مرة واحدة بدون تجديد تلقائي.';
const FUTURE_PREVIEW_MS = 24 * 60 * 60 * 1000;

function firstSelection(goal: PromotionGoal | null): Selection | null {
  if (!goal) return null;
  const first = listPromoteCatalogOptions(goal)[0];
  return first ? { goal, durationHours: first.durationHours } : null;
}

function mapListing(raw: Record<string, any>): Listing {
  return {
    id: raw.id,
    title: raw.title,
    arabicTitle: raw.arabicTitle,
    price: raw.price,
    currency: raw.currency || 'SAR',
    category: raw.category,
    breed: raw.breed || '',
    age: raw.age || '',
    location: raw.location,
    arabicLocation: raw.arabicLocation,
    country: raw.country,
    images: raw.images?.length ? raw.images : [],
    description: raw.description,
    arabicDescription: raw.arabicDescription,
    seller: raw.seller,
    featured: raw.featured ?? false,
    pinned: raw.pinned ?? false,
    featuredUntil: typeof raw.featuredUntil === 'string' ? raw.featuredUntil : null,
    pinnedUntil: typeof raw.pinnedUntil === 'string' ? raw.pinnedUntil : null,
    promoted: raw.promoted ?? false,
    promotedUntil: typeof raw.promotedUntil === 'string' ? raw.promotedUntil : undefined,
    postedAt: raw.createdAt,
    createdAt: raw.createdAt,
  } as Listing;
}

function activeGoals(listing: Listing | null): Record<PromotionGoal, boolean> {
  return {
    featured: listing ? isListingFeaturedActive(listing) : false,
    pinned: listing ? isListingPinnedActive(listing) : false,
    visibility: listing ? isListingPromotedActive(listing) : false,
  };
}

/** The seller's own listing with the selected boost switched on (display only). */
function boostedPreview(listing: Listing, goal: PromotionGoal | null): Listing {
  const until = new Date(Date.now() + FUTURE_PREVIEW_MS).toISOString();
  if (goal === 'featured') return { ...listing, featured: true, featuredUntil: until } as Listing;
  if (goal === 'pinned') return { ...listing, pinned: true, pinnedUntil: until } as Listing;
  if (goal === 'visibility') return { ...listing, promoted: true, promotedUntil: until } as Listing;
  return listing;
}

function ListingPromoteScreen() {
  const { id, goal: goalParam } = useLocalSearchParams<{ id: string; goal?: string }>();
  const { accessToken } = useAuth();
  const { colors } = useTheme();
  const layout = useLayout();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));

  const { flags: paidFlags, hasAnyBoostService, loading: paidLoading } = usePaidServices();

  const [pickedSelection, setSelection] = useState<Selection | null>(() =>
    firstSelection(goalFromBoostType(goalParam ?? null)),
  );
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);
  const [freeQuota, setFreeQuota] = useState<FreeBoostQuota | null>(null);
  const [freeQuotaLoaded, setFreeQuotaLoaded] = useState(false);
  const [stats, setStats] = useState<PromotionStats | null>(null);
  const guardRef = useRef(createSubmitGuard());
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const [listing, setListing] = useState<Listing | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  // Keep the selection on an enabled service (admin can switch services off).
  const selection = useMemo(() => {
    if (!hasAnyBoostService) return pickedSelection;
    if (pickedSelection && isPromoteGoalEnabled(pickedSelection.goal, paidFlags)) return pickedSelection;
    return firstSelection(firstEnabledPromoteGoal(paidFlags));
  }, [hasAnyBoostService, paidFlags, pickedSelection]);
  const goal = selection?.goal ?? null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await (accessToken
          ? authFetch(`${API_BASE}/api/listings/${id}`)
          : fetch(`${API_BASE}/api/listings/${id}`));
        if (!res.ok) throw new Error(`listing_fetch_${res.status}`);
        const json = await res.json();
        if (!json.success || !json.data) throw new Error('listing_fetch_empty');
        if (!cancelled) {
          setListing(mapListing(json.data));
          setLoadState('ready');
        }
      } catch (err) {
        console.warn('[promote] listing load failed', err instanceof Error ? err.message : err);
        if (!cancelled) setLoadState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, id, reloadKey]);

  // Real results of this listing's promotion (owner only). Hidden when empty.
  useEffect(() => {
    if (!id || !accessToken) return;
    let alive = true;
    void fetchPromotionStats(id)
      .then((s) => {
        if (alive) setStats(s);
      })
      .catch(() => {
        /* stats are optional */
      });
    return () => {
      alive = false;
    };
  }, [accessToken, id, reloadKey]);

  const active = useMemo(() => activeGoals(listing), [listing]);

  const retryLoad = useCallback(() => {
    setLoadState('loading');
    setReloadKey((k) => k + 1);
  }, []);

  const enabledServices = useMemo(
    () =>
      PROMOTE_SERVICE_COPY.filter((s) => isPromoteGoalEnabled(s.goal, paidFlags)).map((s) => ({
        ...s,
        durations: listPromoteCatalogOptions(s.goal),
      })),
    [paidFlags],
  );

  const selectedService = useMemo(
    () => enabledServices.find((s) => s.goal === goal) ?? null,
    [enabledServices, goal],
  );

  const selectedDuration = useMemo(
    () => selectedService?.durations.find((d) => d.durationHours === selection?.durationHours) ?? null,
    [selectedService, selection?.durationHours],
  );

  const plans = useMemo(
    () => (selectedService ? buildPromotePlans(selectedService.durations) : []),
    [selectedService],
  );

  const benefits = useMemo<PromoteBenefit[]>(
    () => (goal ? [...PROMOTE_BENEFITS[goal], ...promoteCommonBenefits(selectedDuration?.labelAr ?? null)] : []),
    [goal, selectedDuration?.labelAr],
  );

  useEffect(() => {
    if (!goal || !selectedDuration) return;
    void fetchPromoteQuote(goal, selectedDuration.durationHours).catch(() => {
      /* Catalog amount stays on screen; backend initiate also uses the catalog. */
    });
  }, [goal, selectedDuration]);

  const displayPrice = selectedDuration?.amount ?? null;

  const checkoutPayload = useMemo(() => {
    if (!id || !goal || !selectedDuration) return null;
    return buildPromoteCheckoutPayload(id, goal, selectedDuration.durationHours);
  }, [id, goal, selectedDuration]);

  const canPay = Boolean(accessToken && checkoutPayload && !processing && hasAnyBoostService && goal);

  const onSelect = useCallback((nextGoal: PromotionGoal, durationHours: number) => {
    setSelection((prev) =>
      prev?.goal === nextGoal && prev.durationHours === durationHours ? prev : { goal: nextGoal, durationHours },
    );
    setNotice(null);
  }, []);

  const onSelectService = useCallback(
    (nextGoal: PromotionGoal) => {
      if (nextGoal === goal) return;
      const first = listPromoteCatalogOptions(nextGoal)[0];
      if (first) onSelect(nextGoal, first.durationHours);
    },
    [goal, onSelect],
  );

  const handlePay = useCallback(() => {
    if (!accessToken || !checkoutPayload) return;
    void guardRef.current.run(async () => {
      setProcessing(true);
      setNotice(null);
      try {
        const result = await initiatePromotePayment(accessToken, checkoutPayload);
        const outcome = await launchPaymentCheckout({
          accessToken,
          paymentId: result.paymentId,
          checkoutUrl: result.checkoutUrl,
          devMode: result.devMode,
          context: checkoutPayload.promotionGoal === 'visibility' ? 'promotion' : 'boost',
          returnParams: {
            listingId: checkoutPayload.adId,
            boostType: checkoutPayload.promotionGoal,
            durationHours: String(checkoutPayload.promotionDurationHours),
            promotionAmount: String(result.amount),
          },
        });
        const outcomeNotice = promoteCheckoutOutcomeMessage(outcome);
        if (outcomeNotice && mountedRef.current) setNotice(outcomeNotice);
        if (outcome === 'paid' && mountedRef.current) {
          setSuccess({ title: 'تم الدفع بنجاح', text: 'جاري تفعيل التعزيز على إعلانك.' });
        }
      } catch (err) {
        // Technical detail stays in logs; users get a friendly Arabic message.
        const e = err as { code?: string; status?: number; message?: string };
        console.warn('[promote] payment initiation failed', {
          code: e?.code,
          status: e?.status,
          message: e?.message,
        });
        if (mountedRef.current) setNotice({ tone: 'error', text: promotePaymentErrorMessage(err) });
      } finally {
        if (mountedRef.current) setProcessing(false);
      }
    });
  }, [accessToken, checkoutPayload]);

  const onFreeQuota = useCallback((q: FreeBoostQuota | null) => {
    setFreeQuota(q);
    setFreeQuotaLoaded(true);
  }, []);

  // Entrance: fade + short rise when the real content replaces the skeleton.
  const [contentOpacity] = useState(() => new Animated.Value(0));
  const [contentRise] = useState(() => new Animated.Value(12));
  const showContent = loadState === 'ready' && !paidLoading;
  useEffect(() => {
    if (!showContent) return;
    contentOpacity.setValue(0);
    contentRise.setValue(12);
    Animated.parallel([
      Animated.timing(contentOpacity, { toValue: 1, duration: duration.ui, useNativeDriver: true }),
      Animated.spring(contentRise, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }),
    ]).start();
  }, [contentOpacity, contentRise, showContent]);

  if (!id) {
    return (
      <Screen>
        <ScreenHeader variant="screen" title={TITLE} showBack />
        <ScreenBody scroll={false} padTop="lg">
          <PromoteErrorState styles={styles} colors={colors} message="معرّف الإعلان غير متوفر" />
        </ScreenBody>
      </Screen>
    );
  }

  if (loadState === 'error') {
    return (
      <Screen>
        <ScreenHeader variant="screen" title={TITLE} showBack />
        <ScreenBody scroll={false} padTop="lg">
          <PromoteErrorState
            styles={styles}
            colors={colors}
            message="تعذّر تحميل بيانات الإعلان. تحقق من اتصالك ثم أعد المحاولة."
            onRetry={retryLoad}
          />
        </ScreenBody>
      </Screen>
    );
  }

  const totalLabel = displayPrice != null ? formatSar(displayPrice) : '—';
  const summaryLine =
    selectedService && selectedDuration ? `${selectedService.title} · ${selectedDuration.labelAr}` : '';
  const statusParts = [
    active.featured ? 'مميّز' : null,
    active.pinned ? 'مثبّت' : null,
    active.visibility ? 'معزّز' : null,
  ].filter(Boolean);

  return (
    <Screen>
      <ScreenHeader variant="screen" title={TITLE} showBack />

      <ScreenBody padTop="sm" gap="section" bottomInset="action" padBottom="xxxl">
        {!showContent ? (
          <PromoteSkeleton styles={styles} />
        ) : (
          <Animated.View
            style={[styles.content, { opacity: contentOpacity, transform: [{ translateY: contentRise }] }]}
          >
            {success ? <SuccessPanel success={success} styles={styles} colors={colors} /> : null}

            {/* Hero: value line + the seller's own card as it will look boosted. */}
            <Stack gap="md" testID="promote-hero">
              <Stack gap="xs">
                <AppText variant="heading2" color="textPrimary">
                  {PROMOTE_HERO_LINE}
                </AppText>
                <AppText variant="bodySmall" color="textSecondary">
                  {SUBTITLE}
                </AppText>
              </Stack>
              {listing ? (
                <View style={styles.previewFrame}>
                  <Row gap="xs" align="center" style={styles.previewLabel}>
                    <AppIcon name="eye-outline" size={14} color={colors.textMuted} />
                    <AppText variant="caption" color="textMuted" numberOfLines={1}>
                      {goal === 'visibility'
                        ? 'معاينة: نفس الشكل، بظهور أعلى'
                        : 'معاينة إعلانك بعد التعزيز'}
                    </AppText>
                  </Row>
                  <View
                    pointerEvents="none"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={{ marginHorizontal: -layout.gutter }}
                    testID="promote-preview"
                  >
                    <ListingCard listing={boostedPreview(listing, goal)} variant="list" />
                  </View>
                </View>
              ) : null}
              <AppText variant="caption" color={statusParts.length ? 'success' : 'textMuted'} numberOfLines={1}>
                {statusParts.length ? `مفعّل الآن: ${statusParts.join('، ')}` : 'غير معزّز حالياً'}
              </AppText>
            </Stack>

            {hasPromotionStats(stats) && stats ? (
              <Row gap="md" align="center" style={styles.statsRow} testID="promote-stats">
                <AppIcon name="trending-up-outline" size={18} color={colors.textPrimary} />
                <Stack gap="none" style={styles.fill}>
                  <AppText variant="caption" color="textMuted">
                    نتائج تعزيز إعلانك
                  </AppText>
                  <AppText variant="bodyMedium" color="textPrimary" numberOfLines={1}>
                    {`${stats.impressions.toLocaleString('en-US')} ظهور · ${stats.clicks.toLocaleString('en-US')} نقرة`}
                  </AppText>
                </Stack>
              </Row>
            ) : null}

            {!hasAnyBoostService ? (
              <Row gap="sm" align="start" style={styles.noticeInfo}>
                <AppIcon name="information-outline" size={18} color={colors.textMuted} />
                <AppText variant="caption" color="textMuted" style={styles.fill}>
                  خدمات التعزيز غير مفعّلة حالياً. تواصل مع الإدارة إن لزم.
                </AppText>
              </Row>
            ) : null}

            {/* Blue+/Gold: «استخدم تعزيز مجاني (متبقي n)» — applies with no payment. */}
            {id ? (
              <FreeBoostOption
                listingId={id}
                appearance="prominent"
                enabled={isPromoteGoalEnabled('featured', paidFlags)}
                onQuota={onFreeQuota}
                onApplied={() => {
                  setSuccess({
                    title: 'تم تمييز إعلانك مجاناً',
                    text: 'تم تمييز إعلانك مجاناً لمدة ٢٤ ساعة ضمن اشتراكك.',
                  });
                  setReloadKey((k) => k + 1);
                }}
              />
            ) : null}
            {shouldShowFreeBoostUpsell(freeQuota, freeQuotaLoaded) ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/verification' as never)}
                style={({ pressed }) => [styles.upsell, pressed && styles.pressed]}
                testID="promote-free-upsell"
              >
                <Row gap="sm" align="center">
                  <AppIcon name="diamond-outline" size={16} color={colors.textSecondary} />
                  <AppText variant="caption" color="textSecondary" style={styles.fill} numberOfLines={2}>
                    {FREE_BOOST_UPSELL_AR}
                  </AppText>
                  <AppText variant="label" color="textPrimary">
                    اشترك
                  </AppText>
                </Row>
              </Pressable>
            ) : null}

            {enabledServices.length > 0 ? (
              <Section title="نوع التعزيز" gap="md">
                <Row gap="sm" align="stretch" style={styles.segment} testID="promote-services">
                  {enabledServices.map((svc) => (
                    <ServiceChip
                      key={svc.goal}
                      goal={svc.goal}
                      icon={svc.icon}
                      title={svc.title}
                      fromPrice={svc.durations[0]?.amount ?? null}
                      selected={svc.goal === goal}
                      activeNow={active[svc.goal]}
                      disabled={processing}
                      onPress={onSelectService}
                      styles={styles}
                      colors={colors}
                    />
                  ))}
                </Row>

                {selectedService ? (
                  <Stack gap="sm" testID="promote-benefits" key={`benefits-${selectedService.goal}`}>
                    <AppText variant="bodySmall" color="textSecondary">
                      {selectedService.outcome}
                    </AppText>
                    {benefits.map((b) => (
                      <Row key={b.text} gap="sm" align="center">
                        <View style={styles.benefitIcon}>
                          <AppIcon name={b.icon} size={14} color={colors.textPrimary} />
                        </View>
                        <AppText variant="bodySmall" color="textPrimary" style={styles.fill}>
                          {b.text}
                        </AppText>
                      </Row>
                    ))}
                  </Stack>
                ) : null}
              </Section>
            ) : null}

            {selectedService && plans.length > 0 ? (
              <Section title="اختر المدة" gap="sm">
                <Stack gap="sm" testID="promote-plans">
                  {plans.map((plan) => (
                    <PlanCard
                      key={`${selectedService.goal}-${plan.durationHours}`}
                      goal={selectedService.goal}
                      serviceTitle={selectedService.title}
                      plan={plan}
                      selected={selection?.durationHours === plan.durationHours}
                      onSelect={onSelect}
                      disabled={processing}
                      styles={styles}
                      colors={colors}
                    />
                  ))}
                </Stack>
              </Section>
            ) : null}

            {!accessToken ? (
              <Row gap="sm" align="start" style={styles.noticeInfo}>
                <AppIcon name="lock-closed-outline" size={18} color={colors.textMuted} />
                <AppText variant="caption" color="textMuted" style={styles.fill}>
                  سجّل الدخول لإتمام الدفع.
                </AppText>
              </Row>
            ) : null}

            {notice ? (
              <Row
                gap="sm"
                align="start"
                style={notice.tone === 'error' ? styles.noticeError : styles.noticeInfo}
                testID="promote-notice"
              >
                <AppIcon
                  name={notice.tone === 'error' ? 'alert-circle-outline' : 'information-outline'}
                  size={18}
                  color={notice.tone === 'error' ? colors.danger : colors.textMuted}
                />
                <AppText
                  variant="caption"
                  color={notice.tone === 'error' ? 'danger' : 'textSecondary'}
                  style={styles.fill}
                >
                  {notice.text}
                </AppText>
              </Row>
            ) : null}
          </Animated.View>
        )}
      </ScreenBody>

      <BottomAction testID="promote-cta-bar">
        <Stack gap="sm">
          <Row gap="md" align="center">
            <Stack gap="none" style={styles.totalCol}>
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                الإجمالي
              </AppText>
              <AppText variant="price" color="textPrimary" numberOfLines={1} testID="promote-total">
                {totalLabel}
              </AppText>
              {summaryLine ? (
                <AppText variant="micro" color="textMuted" numberOfLines={1}>
                  {summaryLine}
                </AppText>
              ) : null}
            </Stack>
            <CtaPill
              title={processing ? 'جاري تجهيز الدفع…' : promoteCtaLabel(displayPrice)}
              onPress={handlePay}
              disabled={!canPay}
              loading={processing}
              styles={styles}
              colors={colors}
            />
          </Row>
          <Row gap="sm" align="center" justify="center" style={styles.trust}>
            <AppIcon name="lock-closed-outline" size={12} color={colors.textMuted} />
            <AppText variant="micro" color="textMuted">
              دفع آمن
            </AppText>
            <Row gap="xs" align="center">
              {FEE_PAYMENT_METHODS.map((m) => (
                <PaymentBrandLogo key={m.id} id={m.id} size={16} />
              ))}
            </Row>
          </Row>
        </Stack>
      </BottomAction>
    </Screen>
  );
}

/* ─── Sticky CTA pill (white on dark, black on light) ─────────────────────── */

function CtaPill({
  title,
  onPress,
  disabled,
  loading,
  styles,
  colors,
}: {
  title: string;
  onPress: () => void;
  disabled: boolean;
  loading: boolean;
  styles: Styles;
  colors: ThemeColors;
}) {
  const [scale] = useState(() => new Animated.Value(1));
  const blocked = disabled || loading;
  return (
    <Animated.View style={[styles.ctaWrap, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: blocked, busy: loading }}
        disabled={blocked}
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 5 }).start()}
        style={[styles.cta, disabled && !loading && styles.ctaDisabled]}
        testID="promote-pay"
      >
        {loading ? <ActivityIndicator size="small" color={colors.screenRoot} /> : null}
        <AppText variant="label" numberOfLines={1} style={[styles.ctaText, { color: colors.screenRoot }]}>
          {title}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

/* ─── Success state ──────────────────────────────────────────────────────── */

function SuccessPanel({ success, styles, colors }: { success: Success; styles: Styles; colors: ThemeColors }) {
  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }).start();
  }, [pop]);
  return (
    <Animated.View
      style={[styles.success, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }]}
      testID="promote-success"
      accessibilityLiveRegion="polite"
    >
      <Row gap="md" align="center">
        <View style={styles.successIcon}>
          <AppIcon name="checkmark" size={20} color={colors.screenRoot} />
        </View>
        <Stack gap="none" style={styles.fill}>
          <AppText variant="bodyMedium" color="textPrimary">
            {success.title}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {success.text}
          </AppText>
        </Stack>
      </Row>
    </Animated.View>
  );
}

/* ─── Service chips ──────────────────────────────────────────────────────── */

type ServiceChipProps = {
  goal: PromotionGoal;
  icon: string;
  title: string;
  fromPrice: number | null;
  selected: boolean;
  activeNow: boolean;
  disabled: boolean;
  onPress: (goal: PromotionGoal) => void;
  styles: Styles;
  colors: ThemeColors;
};

const ServiceChip = memo(function ServiceChip({
  goal,
  icon,
  title,
  fromPrice,
  selected,
  activeNow,
  disabled,
  onPress,
  styles,
  colors,
}: ServiceChipProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={fromPrice != null ? `${title}، من ${formatSar(fromPrice)}` : title}
      disabled={disabled}
      onPress={() => onPress(goal)}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && !selected && styles.pressed]}
      testID={`promote-service-${goal}`}
    >
      <AppIcon name={icon} size={18} color={selected ? colors.textPrimary : colors.textSecondary} />
      <AppText variant="label" color={selected ? 'textPrimary' : 'textSecondary'} numberOfLines={1}>
        {title.replace(' الإعلان', '')}
      </AppText>
      {fromPrice != null ? (
        <AppText variant="micro" color="textMuted" numberOfLines={1}>
          {`من ${formatSar(fromPrice)}`}
        </AppText>
      ) : null}
      {activeNow ? (
        <AppText variant="micro" color="success" numberOfLines={1}>
          مفعّل
        </AppText>
      ) : null}
    </Pressable>
  );
});

/* ─── Plan cards ─────────────────────────────────────────────────────────── */

type PlanCardProps = {
  goal: PromotionGoal;
  serviceTitle: string;
  plan: PromotePlanView;
  selected: boolean;
  onSelect: (goal: PromotionGoal, durationHours: number) => void;
  disabled: boolean;
  styles: Styles;
  colors: ThemeColors;
};

const PlanCard = memo(function PlanCard({
  goal,
  serviceTitle,
  plan,
  selected,
  onSelect,
  disabled,
  styles,
  colors,
}: PlanCardProps) {
  // Fixed-size check badge; only its fill/scale animates (no layout shift).
  const [check] = useState(() => new Animated.Value(selected ? 1 : 0));
  useEffect(() => {
    Animated.spring(check, {
      toValue: selected ? 1 : 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: selected ? 8 : 0,
    }).start();
  }, [check, selected]);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${serviceTitle}، ${plan.priceLabel} لمدة ${plan.labelAr}${plan.savingLabel ? `، ${plan.savingLabel}` : ''}`}
      disabled={disabled}
      onPress={() => onSelect(goal, plan.durationHours)}
      style={({ pressed }) => [styles.plan, selected && styles.planSelected, pressed && !selected && styles.pressed]}
      testID={`promote-pkg-${goal}-${plan.durationHours}`}
    >
      <Row gap="md" align="center">
        <View style={[styles.check, { borderColor: selected ? colors.textPrimary : colors.borderStrong }]}>
          <Animated.View
            style={[
              styles.checkFill,
              {
                backgroundColor: colors.textPrimary,
                opacity: check,
                transform: [{ scale: check.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
              },
            ]}
          >
            <AppIcon name="checkmark" size={14} color={colors.screenRoot} />
          </Animated.View>
        </View>
        <Stack gap="none" style={styles.fill}>
          <Row gap="sm" align="center">
            <AppText variant="cardTitle" color="textPrimary" numberOfLines={1}>
              {plan.labelAr}
            </AppText>
            {plan.bestValue ? (
              <View style={styles.badge} testID="promote-best-value">
                <AppText variant="micro" style={{ color: colors.screenRoot }}>
                  {PROMOTE_BEST_VALUE_BADGE}
                </AppText>
              </View>
            ) : null}
          </Row>
          {plan.perDayLabel || plan.savingLabel ? (
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {[plan.perDayLabel, plan.savingLabel].filter(Boolean).join(' · ')}
            </AppText>
          ) : (
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {`${plan.durationHours} ساعة`}
            </AppText>
          )}
        </Stack>
        <AppText variant="price" color="textPrimary" numberOfLines={1}>
          {plan.priceLabel}
        </AppText>
      </Row>
    </Pressable>
  );
});

/* ─── Loading skeleton ───────────────────────────────────────────────────── */

const PromoteSkeleton = memo(function PromoteSkeleton({ styles }: { styles: Styles }) {
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: duration.slow * 2, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: duration.slow * 2, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[styles.content, { opacity: pulse }]}
      accessibilityLabel="جاري التحميل"
      testID="promote-skeleton"
    >
      <Stack gap="sm">
        <View style={[styles.skelLine, styles.skelWide, styles.skelTall]} />
        <View style={[styles.skelLine, styles.skelMid]} />
      </Stack>
      <View style={[styles.skelCard, styles.skel]} />
      <Row gap="sm" align="stretch">
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.chip, styles.skelChip]} />
        ))}
      </Row>
      {[0, 1].map((i) => (
        <View key={i} style={[styles.plan, styles.skelPlan]} />
      ))}
    </Animated.View>
  );
});

/* ─── Error state ────────────────────────────────────────────────────────── */

function PromoteErrorState({
  styles,
  colors,
  message,
  onRetry,
}: {
  styles: Styles;
  colors: ThemeColors;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Stack gap="md" align="center" style={styles.errorState} testID="promote-error">
      <View style={styles.errorIcon}>
        <AppIcon name="alert-circle-outline" size={26} color={colors.textMuted} />
      </View>
      <AppText variant="body" color="textSecondary" align="center">
        {message}
      </AppText>
      {onRetry ? <SarhButton title="إعادة المحاولة" variant="secondary" onPress={onRetry} /> : null}
    </Stack>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: { gap: spacing.xxl },
    fill: { flex: 1, minWidth: 0 },
    pressed: { opacity: 0.85 },
    previewFrame: { gap: spacing.sm },
    previewLabel: { paddingHorizontal: spacing.xs },
    statsRow: {
      minHeight: 56,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      backgroundColor: colors.bgSurface,
    },
    upsell: {
      minHeight: 44,
      justifyContent: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    segment: {},
    chip: {
      flex: 1,
      minWidth: 0,
      minHeight: 84,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.bgSurface,
    },
    chipSelected: { borderWidth: 1.5, borderColor: colors.textPrimary },
    benefitIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      flexShrink: 0,
    },
    plan: {
      minHeight: 64,
      justifyContent: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.bgSurface,
    },
    planSelected: { borderWidth: 1.5, borderColor: colors.textPrimary },
    check: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      flexShrink: 0,
    },
    checkFill: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      backgroundColor: colors.textPrimary,
    },
    totalCol: { flexShrink: 0, minWidth: 84 },
    ctaWrap: { flex: 1, minWidth: 0 },
    cta: {
      minHeight: 50,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: colors.textPrimary,
    },
    ctaDisabled: { opacity: 0.4 },
    ctaText: { flexShrink: 1 },
    trust: { minHeight: 18 },
    success: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: colors.textPrimary,
      backgroundColor: colors.bgSurface,
    },
    successIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.textPrimary,
    },
    noticeInfo: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.bgSurface,
    },
    noticeError: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: `${colors.danger}12`,
    },
    errorState: { paddingTop: spacing.xxxl, paddingHorizontal: spacing.lg },
    errorIcon: {
      width: 56,
      height: 56,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgSurface,
    },
    skel: { backgroundColor: colors.bgElevated },
    skelLine: { height: 12, borderRadius: radius.sm, backgroundColor: colors.bgElevated },
    skelTall: { height: 22 },
    skelWide: { width: '80%' },
    skelMid: { width: '50%' },
    skelCard: { height: 120, borderRadius: radius.lg },
    skelChip: { backgroundColor: colors.bgElevated, borderColor: colors.bgElevated },
    skelPlan: { backgroundColor: colors.bgElevated, borderColor: colors.bgElevated },
  });
}

/** Store builds hide digital purchases (lib/storePurchases.ts) — deep links land on «غير متاحة حالياً». */
export default function ListingPromoteRoute() {
  if (!digitalPurchasesEnabled()) return <DigitalPurchasesUnavailable title="ترقية الإعلان" />;
  return <ListingPromoteScreen />;
}
