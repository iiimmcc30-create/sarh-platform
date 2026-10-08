// Sarh — Promote a listing (Featured / Pinned / Visibility).
// Calm, card-light layout: compact listing preview, one block per existing
// service with its catalog packages side by side (price first, duration under
// it), a short summary and a sticky total + CTA. Prices/durations come only
// from the official catalog; the server charges from the same table. Payment
// still goes through initiatePromotePayment → launchPaymentCheckout.
import { ListingBoostTitleIcons } from '@/components/listing/ListingBoostTitleIcons';
import { Image, uriSource } from '@/components/ui/AppImage';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
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
import { listPromoteCatalogOptions, type PromoteCatalogOption } from '@/services/promoteCatalog';
import { usePaidServices } from '@/hooks/usePaidServices';
import { FreeBoostOption } from '@/components/listing/FreeBoostOption';
import { firstEnabledPromoteGoal, isPromoteGoalEnabled } from '@/services/paidServices';
import {
  PROMOTE_SERVICE_COPY,
  createSubmitGuard,
  durationPhrase,
  formatSar,
  promoteCheckoutOutcomeMessage,
  promotePaymentErrorMessage,
} from '@/lib/promotePage';
import { useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { AppText, SarhButton, SarhDivider } from '@/design-system/components';
import { BottomAction, Row, Screen, ScreenBody, Section, Stack } from '@/design-system/layout';

type Selection = { goal: PromotionGoal; durationHours: number };
type Notice = { tone: 'error' | 'info'; text: string };
type LoadState = 'loading' | 'ready' | 'error';
type Styles = ReturnType<typeof createStyles>;

const TITLE = 'عزّز إعلانك';
const SUBTITLE = 'اختر طريقة لإبراز إعلانك. الدفع مرة واحدة بدون تجديد تلقائي.';

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

export default function ListingPromoteScreen() {
  const { id, goal: goalParam } = useLocalSearchParams<{ id: string; goal?: string }>();
  const { accessToken } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));

  const { flags: paidFlags, hasAnyBoostService, loading: paidLoading } = usePaidServices();

  const [pickedSelection, setSelection] = useState<Selection | null>(() =>
    firstSelection(goalFromBoostType(goalParam ?? null)),
  );
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
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

  // Light fade when the real content replaces the skeleton.
  const [contentOpacity] = useState(() => new Animated.Value(0));
  const showContent = loadState === 'ready' && !paidLoading;
  useEffect(() => {
    if (!showContent) return;
    contentOpacity.setValue(0);
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: duration.ui,
      useNativeDriver: true,
    }).start();
  }, [contentOpacity, showContent]);

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

  return (
    <Screen>
      <ScreenHeader variant="screen" title={TITLE} showBack />

      <ScreenBody padTop="sm" gap="section" bottomInset="action">
        <AppText variant="bodySmall" color="textSecondary">
          {SUBTITLE}
        </AppText>

        {!showContent ? (
          <PromoteSkeleton styles={styles} />
        ) : (
          <Animated.View style={[styles.content, { opacity: contentOpacity }]}>
            <ListingPreview listing={listing} active={active} styles={styles} colors={colors} />

            {!hasAnyBoostService ? (
              <Row gap="sm" align="start" style={styles.noticeInfo}>
                <AppIcon name="information-outline" size={18} color={colors.textMuted} />
                <AppText variant="caption" color="textMuted" style={styles.fill}>
                  خدمات التعزيز غير مفعّلة حالياً. تواصل مع الإدارة إن لزم.
                </AppText>
              </Row>
            ) : null}

            {/* Blue+/Gold: «تمييز مجاني (متبقي X)» first — applies with no payment. */}
            {id ? (
              <FreeBoostOption
                listingId={id}
                enabled={isPromoteGoalEnabled('featured', paidFlags)}
                onApplied={() => {
                  setNotice({ tone: 'info', text: 'تم تمييز إعلانك مجاناً لمدة ٢٤ ساعة ضمن اشتراكك.' });
                  setReloadKey((k) => k + 1);
                }}
              />
            ) : null}

            {enabledServices.length > 0 ? (
              <Section title="اختر نوع التعزيز" gap="md">
                {enabledServices.map((svc) => (
                  <ServiceBlock
                    key={svc.goal}
                    goal={svc.goal}
                    icon={svc.icon}
                    title={svc.title}
                    desc={svc.desc}
                    outcome={svc.outcome}
                    durations={svc.durations}
                    isActiveNow={active[svc.goal]}
                    selectedHours={selection?.goal === svc.goal ? selection.durationHours : null}
                    onSelect={onSelect}
                    disabled={processing}
                    styles={styles}
                    colors={colors}
                  />
                ))}
              </Section>
            ) : null}

            {selectedService && selectedDuration && displayPrice != null ? (
              <Section title="ملخص التعزيز" gap="sm">
                <Row justify="between">
                  <AppText variant="bodySmall" color="textMuted">الخدمة</AppText>
                  <AppText variant="bodyMedium" color="textPrimary">{selectedService.title}</AppText>
                </Row>
                <Row justify="between">
                  <AppText variant="bodySmall" color="textMuted">المدة</AppText>
                  <AppText variant="bodyMedium" color="textPrimary">{selectedDuration.labelAr}</AppText>
                </Row>
                <SarhDivider />
                <Row justify="between">
                  <AppText variant="bodyMedium" color="textPrimary">الإجمالي</AppText>
                  <AppText variant="price" color="textPrimary">{formatSar(displayPrice)}</AppText>
                </Row>
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

      <BottomAction summary={{ label: 'الإجمالي', value: totalLabel }}>
        <SarhButton
          title={processing ? 'جاري تجهيز الدفع…' : 'متابعة للدفع'}
          onPress={handlePay}
          disabled={!canPay}
          loading={processing}
          fullWidth
          testID="promote-pay"
        />
      </BottomAction>
    </Screen>
  );
}

/* ─── Listing preview (compact row, not the grid card) ─────────────────────── */

type PreviewProps = {
  listing: Listing | null;
  active: Record<PromotionGoal, boolean>;
  styles: Styles;
  colors: ThemeColors;
};

const ListingPreview = memo(function ListingPreview({ listing, active, styles, colors }: PreviewProps) {
  const title = listing?.arabicTitle || listing?.title || 'إعلانك';
  const thumb = listing?.images?.[0];
  const location = listing?.arabicLocation || listing?.location || '';
  const currency = !listing?.currency || listing.currency === 'SAR' ? 'ر.س' : listing.currency;
  const price =
    listing?.price && listing.price > 0 ? `${listing.price.toLocaleString('ar-SA')} ${currency}` : '';
  const statusParts = [
    active.featured ? 'مميّز' : null,
    active.pinned ? 'مثبّت' : null,
    active.visibility ? 'معزّز' : null,
  ].filter(Boolean);

  return (
    <Row gap="md" align="center" style={styles.preview}>
      <View style={styles.thumb}>
        {thumb ? (
          <Image source={uriSource(thumb)} style={styles.thumbImg} contentFit="cover" />
        ) : (
          <AppIcon name="image-outline" size={20} color={colors.textMuted} />
        )}
      </View>
      <Stack gap="xs" style={styles.fill}>
        <Row gap="xs" align="center">
          <AppText variant="bodyMedium" color="textPrimary" numberOfLines={1} style={styles.shrink}>
            {title}
          </AppText>
          <ListingBoostTitleIcons pinned={active.pinned} featured={active.featured} />
        </Row>
        {price || location ? (
          <Row gap="sm" align="center" wrap>
            {price ? (
              <AppText variant="bodySmall" style={{ color: colors.textBrandStrong }} numberOfLines={1}>
                {price}
              </AppText>
            ) : null}
            {location ? (
              <Row gap="xs" align="center" style={styles.shrink}>
                <AppIcon name="location-outline" size={13} color={colors.textMuted} />
                <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.shrink}>
                  {location}
                </AppText>
              </Row>
            ) : null}
          </Row>
        ) : null}
        <AppText variant="caption" color="textMuted" numberOfLines={1}>
          {statusParts.length ? `مفعّل الآن: ${statusParts.join('، ')}` : 'غير معزّز حالياً'}
        </AppText>
      </Stack>
    </Row>
  );
});

/* ─── Service + packages ─────────────────────────────────────────────────── */

type ServiceBlockProps = {
  goal: PromotionGoal;
  icon: string;
  title: string;
  desc: string;
  outcome: string;
  durations: PromoteCatalogOption[];
  isActiveNow: boolean;
  selectedHours: number | null;
  onSelect: (goal: PromotionGoal, durationHours: number) => void;
  disabled: boolean;
  styles: Styles;
  colors: ThemeColors;
};

const ServiceBlock = memo(function ServiceBlock({
  goal,
  icon,
  title,
  desc,
  outcome,
  durations,
  isActiveNow,
  selectedHours,
  onSelect,
  disabled,
  styles,
  colors,
}: ServiceBlockProps) {
  const selected = selectedHours != null;
  const fromPrice = durations[0]?.amount;
  return (
    <View style={[styles.service, selected && styles.serviceSelected]} testID={`promote-service-${goal}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title} — ${desc}`}
        disabled={disabled || selected || !durations[0]}
        onPress={() => durations[0] && onSelect(goal, durations[0].durationHours)}
      >
        <Row gap="md" align="start">
          <View style={styles.serviceIcon}>
            <AppIcon name={icon} size={18} color={selected ? colors.electricBright : colors.textSecondary} />
          </View>
          <Stack gap="none" style={styles.fill}>
            <Row gap="sm" align="center" justify="between">
              <AppText variant="bodyMedium" color="textPrimary" numberOfLines={1} style={styles.shrink}>
                {title}
              </AppText>
              {fromPrice != null && durations.length > 1 ? (
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                  {`من ${formatSar(fromPrice)}`}
                </AppText>
              ) : null}
            </Row>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {desc}
            </AppText>
            <AppText variant="caption" color="textMuted" numberOfLines={2}>
              {outcome}
            </AppText>
            {isActiveNow ? (
              <AppText variant="caption" color="success" numberOfLines={1}>
                مفعّل على إعلانك الآن
              </AppText>
            ) : null}
          </Stack>
        </Row>
      </Pressable>

      <Row gap="sm" align="stretch" style={styles.packages}>
        {durations.map((option) => (
          <PackageOption
            key={option.durationHours}
            goal={goal}
            serviceTitle={title}
            option={option}
            selected={selectedHours === option.durationHours}
            onSelect={onSelect}
            disabled={disabled}
            styles={styles}
            colors={colors}
          />
        ))}
      </Row>
    </View>
  );
});

type PackageOptionProps = {
  goal: PromotionGoal;
  serviceTitle: string;
  option: PromoteCatalogOption;
  selected: boolean;
  onSelect: (goal: PromotionGoal, durationHours: number) => void;
  disabled: boolean;
  styles: Styles;
  colors: ThemeColors;
};

const PackageOption = memo(function PackageOption({
  goal,
  serviceTitle,
  option,
  selected,
  onSelect,
  disabled,
  styles,
  colors,
}: PackageOptionProps) {
  // Fixed-size radio; only the inner dot animates (no layout shift).
  const [dot] = useState(() => new Animated.Value(selected ? 1 : 0));
  useEffect(() => {
    Animated.timing(dot, {
      toValue: selected ? 1 : 0,
      duration: duration.press,
      useNativeDriver: true,
    }).start();
  }, [dot, selected]);

  const price = formatSar(option.amount);
  const phrase = durationPhrase(option.labelAr);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${serviceTitle}، ${price} ${phrase}`}
      disabled={disabled}
      onPress={() => onSelect(goal, option.durationHours)}
      style={({ pressed }) => [
        styles.pkg,
        selected && { borderColor: colors.electricBright, backgroundColor: colors.bgElevated },
        pressed && !selected && styles.pressed,
      ]}
      testID={`promote-pkg-${goal}-${option.durationHours}`}
    >
      <Row gap="sm" align="center" justify="between">
        <Stack gap="none" style={styles.fill}>
          <AppText variant="price" color="textPrimary" numberOfLines={1}>
            {price}
          </AppText>
          <AppText variant="caption" color={selected ? 'textSecondary' : 'textMuted'} numberOfLines={1}>
            {phrase}
          </AppText>
        </Stack>
        <View style={[styles.radio, { borderColor: selected ? colors.electricBright : colors.borderMid }]}>
          <Animated.View
            style={[
              styles.radioDot,
              {
                backgroundColor: colors.electricBright,
                opacity: dot,
                transform: [{ scale: dot.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
              },
            ]}
          />
        </View>
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
      <Row gap="md" align="center" style={styles.preview}>
        <View style={[styles.thumb, styles.skel]} />
        <Stack gap="sm" style={styles.fill}>
          <View style={[styles.skelLine, styles.skelWide]} />
          <View style={[styles.skelLine, styles.skelMid]} />
        </Stack>
      </Row>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.service}>
          <Row gap="md" align="start">
            <View style={[styles.serviceIcon, styles.skel]} />
            <Stack gap="sm" style={styles.fill}>
              <View style={[styles.skelLine, styles.skelMid]} />
              <View style={[styles.skelLine, styles.skelWide]} />
            </Stack>
          </Row>
          <Row gap="sm" align="stretch" style={styles.packages}>
            <View style={[styles.pkg, styles.skelPkg]} />
            <View style={[styles.pkg, styles.skelPkg]} />
          </Row>
        </View>
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
    shrink: { flexShrink: 1, minWidth: 0 },
    pressed: { opacity: 0.85 },
    preview: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
    },
    thumb: {
      width: 56,
      height: 56,
      borderRadius: radius.md,
      overflow: 'hidden',
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    thumbImg: { width: '100%', height: '100%' },
    service: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      gap: spacing.md,
    },
    serviceSelected: { borderColor: colors.borderMid },
    serviceIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
      flexShrink: 0,
    },
    packages: { flexWrap: 'wrap' },
    pkg: {
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 128,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.bgSurface,
    },
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    radioDot: { width: 8, height: 8, borderRadius: 4 },
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
    skelWide: { width: '80%' },
    skelMid: { width: '50%' },
    skelPkg: { height: 52, backgroundColor: colors.bgElevated, borderColor: colors.bgElevated },
  });
}
