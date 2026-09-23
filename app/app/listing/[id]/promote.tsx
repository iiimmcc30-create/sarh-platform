import { ListingBoostTitleIcons } from '@/components/listing/ListingBoostTitleIcons';
import { Image, uriSource } from '@/components/ui/AppImage';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { launchPaymentCheckout } from '@/services/payments';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import type { Listing } from '@/services/types';
import {
  buildPromoteCheckoutPayload,
  fetchPromoteQuote,
  formatPromoteAmount,
  goalFromBoostType,
  initiatePromotePayment,
  type PromotionGoal,
} from '@/services/listingPromote';
import { listPromoteCatalogOptions } from '@/services/promoteCatalog';
import { usePaidServices } from '@/hooks/usePaidServices';
import {
  firstEnabledPromoteGoal,
  isPromoteGoalEnabled,
} from '@/services/paidServices';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppText, SarhButton, SarhCard, SarhDivider } from '@/design-system/components';
import {
  BottomAction,
  Row,
  Screen,
  ScreenBody,
  Section,
  Stack,
} from '@/design-system/layout';

type ServiceCopy = {
  goal: PromotionGoal;
  icon: string;
  title: string;
  desc: string;
};

const SERVICE_COPY: ServiceCopy[] = [
  {
    goal: 'featured',
    icon: 'star',
    title: 'تمييز الإعلان',
    desc: 'نجمة ذهبية بجانب العنوان في نتائج البحث',
  },
  {
    goal: 'pinned',
    icon: 'pin',
    title: 'تثبيت الإعلان',
    desc: 'يبقى الإعلان في أعلى القائمة مع دبوس صغير',
  },
  {
    goal: 'visibility',
    icon: 'rocket-outline',
    title: 'ترويج الإعلان',
    desc: 'زيادة قوة الظهور في الخوارزمية بدون تغيير بصري',
  },
];

export default function ListingPromoteScreen() {
  const { id, goal: goalParam } = useLocalSearchParams<{ id: string; goal?: string }>();
  const { accessToken } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));

  const { flags: paidFlags, hasAnyBoostService } = usePaidServices();
  const initialGoal = goalFromBoostType(goalParam ?? null);

  const [goal, setGoal] = useState<PromotionGoal | null>(initialGoal);
  const [selectedDurationIndex, setSelectedDurationIndex] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [listing, setListing] = useState<Listing | null>(null);
  const [listingLoading, setListingLoading] = useState(true);

  useEffect(() => {
    if (!hasAnyBoostService) return;
    if (goal && isPromoteGoalEnabled(goal, paidFlags)) return;
    setGoal(firstEnabledPromoteGoal(paidFlags));
  }, [goal, hasAnyBoostService, paidFlags]);

  useEffect(() => {
    setSelectedDurationIndex(0);
    setError(null);
  }, [goal]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setListingLoading(true);
    void (async () => {
      try {
        const res = await (accessToken
          ? authFetch(`${API_BASE}/api/listings/${id}`)
          : fetch(`${API_BASE}/api/listings/${id}`));
        if (!res.ok) throw new Error('fetch_failed');
        const json = await res.json();
        const raw = json.data;
        if (!cancelled && json.success && raw) {
          setListing({
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
            promoted: raw.promoted ?? false,
            postedAt: raw.createdAt,
            createdAt: raw.createdAt,
          } as Listing);
        }
      } catch {
        if (!cancelled) setListing(null);
      } finally {
        if (!cancelled) setListingLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, id]);

  const listingTitle = listing?.arabicTitle || listing?.title || 'إعلانك';
  const listingThumb = listing?.images?.[0];

  const enabledServices = useMemo(
    () =>
      SERVICE_COPY.filter((s) => isPromoteGoalEnabled(s.goal, paidFlags)).map((s) => ({
        ...s,
        durations: listPromoteCatalogOptions(s.goal),
      })),
    [paidFlags],
  );

  const selectedService = useMemo(
    () => enabledServices.find((s) => s.goal === goal) ?? null,
    [enabledServices, goal],
  );

  const selectedDuration = selectedService?.durations[selectedDurationIndex] ?? null;

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

  const handlePay = useCallback(async () => {
    if (!accessToken || !checkoutPayload) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await initiatePromotePayment(accessToken, checkoutPayload);
      await launchPaymentCheckout({
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر بدء عملية الدفع');
    } finally {
      setProcessing(false);
    }
  }, [accessToken, checkoutPayload]);

  if (!id) {
    return (
      <Screen>
        <ScreenHeader variant="screen" title="تعزيز سرح" showBack />
        <ScreenBody scroll={false} padTop="lg" style={styles.centered}>
          <AppText variant="body" color="textMuted">معرّف الإعلان غير متوفر</AppText>
        </ScreenBody>
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <ScreenHeader variant="screen" title="تعزيز سرح" showBack />

      <ScreenBody padTop="lg" gap="section" bottomInset="action">
        <SarhCard level="card" padding="md">
          <Row gap="md">
            <View style={styles.thumbWrap}>
              {listingThumb ? (
                <Image source={uriSource(listingThumb)} style={styles.thumbImg} contentFit="cover" />
              ) : (
                <View style={styles.thumbPlaceholder}>
                  <AppIcon name="image-outline" size={22} color={colors.textMuted} />
                </View>
              )}
            </View>
            <Stack gap="xs" style={styles.listingBody}>
              {listingLoading ? (
                <ActivityIndicator color={colors.electricBright} size="small" />
              ) : (
                <>
                  <Row gap="xs" align="start">
                    <AppText variant="bodyMedium" color="textPrimary" numberOfLines={2} style={styles.fill}>
                      {listingTitle}
                    </AppText>
                    <ListingBoostTitleIcons pinned={listing?.pinned} featured={listing?.featured} />
                  </Row>
                  {listing?.price && listing.price > 0 ? (
                    <AppText variant="caption" style={styles.listingPrice}>
                      {listing.price.toLocaleString('ar-SA')} {listing.currency || 'SAR'}
                    </AppText>
                  ) : null}
                </>
              )}
            </Stack>
          </Row>
        </SarhCard>

        {!hasAnyBoostService ? (
          <Row gap="sm" style={styles.disabledBanner}>
            <AppIcon name="information-outline" size={18} color={colors.textMuted} />
            <AppText variant="caption" color="textMuted" style={styles.fill}>
              خدمات التعزيز غير مفعّلة حالياً. تواصل مع الإدارة إن لزم.
            </AppText>
          </Row>
        ) : null}

        <Section title="اختر الخدمة">
          <Stack gap="sm">
            {enabledServices.map((svc, idx) => {
              const selected = goal === svc.goal;
              return (
                <View key={svc.goal}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setGoal(svc.goal)}
                    style={({ pressed }) => [
                      styles.serviceRow,
                      selected && styles.serviceRowSelected,
                      { opacity: pressed ? 0.75 : 1 },
                    ]}
                  >
                    <Row gap="md" fill>
                      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                        {selected ? <View style={styles.radioInner} /> : null}
                      </View>
                      <AppIcon
                        name={svc.icon}
                        size={18}
                        color={selected ? colors.electricBright : colors.textMuted}
                      />
                      <Stack gap="none" style={styles.fill}>
                        <AppText variant="bodyMedium" color={selected ? 'textPrimary' : 'textSecondary'}>
                          {svc.title}
                        </AppText>
                        <AppText variant="caption" color="textMuted" numberOfLines={1}>
                          {svc.desc}
                        </AppText>
                      </Stack>
                    </Row>
                  </Pressable>
                  {idx < enabledServices.length - 1 ? <SarhDivider inset /> : null}
                </View>
              );
            })}
          </Stack>
        </Section>

        {selectedService ? (
          <Section title="اختر المدة">
            <Row gap="sm" align="stretch">
              {selectedService.durations.map((dur, i) => {
                const active = selectedDurationIndex === i;
                return (
                  <Pressable
                    key={dur.durationHours}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelectedDurationIndex(i)}
                    style={({ pressed }) => [
                      styles.durationChip,
                      active && styles.durationChipActive,
                      { opacity: pressed ? 0.75 : 1 },
                    ]}
                  >
                    <AppText
                      variant="bodyMedium"
                      color={active ? 'textPrimary' : 'textSecondary'}
                      align="center"
                    >
                      {dur.labelAr}
                    </AppText>
                    <AppText
                      variant="price"
                      color={active ? 'textPrimary' : 'textMuted'}
                      align="center"
                    >
                      {formatPromoteAmount(dur.amount)}
                    </AppText>
                  </Pressable>
                );
              })}
            </Row>
          </Section>
        ) : null}

        {selectedService && selectedDuration && displayPrice != null ? (
          <Section title="ملخص التعزيز">
            <Stack gap="md">
              <Stack gap="xs">
                <AppText variant="caption" color="textMuted">
                  الخدمة
                </AppText>
                <AppText variant="bodyMedium" color="textPrimary">
                  {selectedService.title}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {formatPromoteAmount(displayPrice)} / {selectedDuration.labelAr}
                </AppText>
              </Stack>
              <Stack gap="xs">
                <AppText variant="caption" color="textMuted">
                  المدة
                </AppText>
                <AppText variant="bodyMedium" color="textPrimary">
                  {selectedDuration.labelAr}
                </AppText>
              </Stack>
              <SarhDivider />
              <Row justify="between" align="end">
                <AppText variant="bodyMedium" color="textPrimary">
                  الإجمالي
                </AppText>
                <AppText variant="price" color="textPrimary">
                  {formatPromoteAmount(displayPrice)}
                </AppText>
              </Row>
            </Stack>
          </Section>
        ) : null}

        {error ? (
          <Row gap="sm" align="start" style={styles.errorRow}>
            <AppIcon name="alert-circle-outline" size={16} color={colors.danger} />
            <AppText variant="caption" color="danger" style={styles.fill}>{error}</AppText>
          </Row>
        ) : null}
      </ScreenBody>

      <BottomAction>
        <SarhButton
          title="المتابعة للدفع"
          onPress={handlePay}
          disabled={!canPay}
          loading={processing}
          fullWidth
        />
      </BottomAction>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    centered: { alignItems: 'center', justifyContent: 'center' },
    fill: { flex: 1, minWidth: 0 },
    thumbWrap: { width: 64, height: 64, borderRadius: radius.lg, overflow: 'hidden', flexShrink: 0 },
    thumbImg: { width: '100%', height: '100%' },
    thumbPlaceholder: {
      flex: 1,
      backgroundColor: colors.bgDeep,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listingBody: { flex: 1, minWidth: 0 },
    listingPrice: { color: colors.textBrandStrong },
    disabledBanner: {
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    serviceRow: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    serviceRowSelected: {
      borderColor: colors.electricBright,
      backgroundColor: colors.bgElevated,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.borderMid,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    radioOuterSelected: { borderColor: colors.electricBright },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.electricBright,
    },
    durationChip: {
      flex: 1,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.bgSurface,
      alignItems: 'center',
      gap: spacing.xs,
    },
    durationChipActive: {
      borderColor: colors.electricBright,
      backgroundColor: colors.bgElevated,
    },
    errorRow: {
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: `${colors.danger}12`,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${colors.danger}40`,
    },
  });
}
