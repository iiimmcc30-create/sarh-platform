// «التوثيق» — X Premium-style settings hub for the verification subscription.
// Flat settings rows (outline icon · title · grey description, switches
// inline), the same header as every settings page (title + @username). The
// model lives in lib/verificationHub.ts (unit-tested): this screen loads
// GET /verification/status, renders the sections and runs the row actions.
import { useCallback, useMemo, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { SettingsStatus } from '@/components/settings/SettingsRows';
import { TierBadgeMark } from '@/components/verification/TierBadgeMark';
import { AppText, SarhButton, SarhSettingsRow, SarhSettingsSection } from '@/design-system/components';
import { duration } from '@/design-system/tokens';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useStorePrices } from '@/hooks/useStorePrices';
import { invalidateFreeTrialEligibility } from '@/hooks/useFreeTrialEligibility';
import { alertMessage, confirmDestructive } from '@/lib/actionSheet';
import { getRtlRow } from '@/lib/rtl';
import { safePush } from '@/lib/safeNavigate';
import { digitalPurchasesEnabled, usesStoreBilling } from '@/lib/storePurchases';
import { STORE_PRODUCTS, subscriptionProductForTier } from '@/lib/storeProducts';
import {
  VERIFICATION_HUB_TITLE,
  billingSourceOf,
  buildVerificationHub,
  type HubAction,
  type HubRow,
} from '@/lib/verificationHub';
import { openStoreSubscriptionManagementFor } from '@/services/iap';
import {
  VERIFICATION_TIER_ORDER,
  cancelVerificationSubscription,
  fetchVerificationStatus,
  updateBadgePreferences,
  type BadgePreferences,
  type VerificationStatus,
  type VerificationTierId,
} from '@/services/verification';

const STORE_SUBSCRIPTION_IDS = STORE_PRODUCTS.filter((p) => p.storeType === 'subs').map((p) => p.productId);

export default function VerificationHubScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const purchasesEnabled = digitalPurchasesEnabled();
  const storeBilling = usesStoreBilling();
  const { prices } = useStorePrices(storeBilling && purchasesEnabled ? STORE_SUBSCRIPTION_IDS : []);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [fade] = useState(() => new Animated.Value(0));

  const load = useCallback(async () => {
    const next = await fetchVerificationStatus();
    if (!next) {
      setState((s) => (s === 'ready' ? s : 'error'));
      return;
    }
    setStatus(next);
    setState('ready');
    Animated.timing(fade, { toValue: 1, duration: duration.ui, useNativeDriver: true }).start();
  }, [fade]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const storePrices = useMemo(() => {
    const out: Partial<Record<VerificationTierId, string>> = {};
    for (const t of VERIFICATION_TIER_ORDER) {
      const p = prices[subscriptionProductForTier(t).productId]?.displayPrice;
      if (p) out[t] = p;
    }
    return out;
  }, [prices]);

  const model = useMemo(
    () => buildVerificationHub({ status, purchasesEnabled, storeBilling, storePrices }),
    [status, purchasesEnabled, storeBilling, storePrices],
  );

  const go = (href: string) => safePush(href, undefined, router);

  const setPref = async (key: keyof BadgePreferences, next: boolean) => {
    if (!status) return;
    const previous = status.preferences ?? { hideVerifiedBadge: false, hideGoldSellerLabel: false };
    setStatus({ ...status, preferences: { ...previous, [key]: next } });
    const saved = await updateBadgePreferences({ [key]: next });
    if (!saved) {
      setStatus((s) => (s ? { ...s, preferences: previous } : s));
      await alertMessage('تعذّر الحفظ', 'تحقق من الاتصال وحاول مجدداً');
      return;
    }
    setStatus((s) => (s ? { ...s, preferences: saved } : s));
  };

  const manageInStore = async () => {
    const source = billingSourceOf(status);
    const tier = status?.subscription.tier;
    if (source !== 'app_store' && source !== 'google_play') return;
    await openStoreSubscriptionManagementFor(source, tier ? subscriptionProductForTier(tier).productId : undefined);
  };

  const cancelRenewal = async () => {
    const ok = await confirmDestructive(
      'إلغاء التجديد',
      'تبقى الشارة والمزايا حتى نهاية الفترة المدفوعة، ولن نرسل لك تذكيرات التجديد.',
      'إلغاء التجديد',
    );
    if (!ok) return;
    setBusy(true);
    const res = await cancelVerificationSubscription();
    setBusy(false);
    if (!res.ok) {
      await alertMessage(res.code === 'manage_in_store' ? 'إدارة الاشتراك من المتجر' : 'تعذّر الإلغاء', res.error ?? '');
    }
    void load();
  };

  const runAction = (action: HubAction, next?: boolean) => {
    if (busy) return;
    switch (action) {
      case 'manage-store':
        void manageInStore();
        return;
      case 'cancel-renewal':
        void cancelRenewal();
        return;
      case 'renew':
      case 'upgrade':
        go('/verification');
        return;
      case 'trial':
        invalidateFreeTrialEligibility();
        go('/verification?tier=blue_plus');
        return;
      case 'upgrade-gold':
        go('/verification?tier=gold');
        return;
      case 'payments':
        go('/settings/payments');
        return;
      case 'free-boosts':
        go(purchasesEnabled ? '/promote' : '/(tabs)/profile');
        return;
      case 'daily-listings':
        go('/create/listing');
        return;
      case 'profile-views':
        go('/profile/views');
        return;
      case 'support':
        go('/support/tickets/create');
        return;
      case 'councils':
        go('/councils');
        return;
      case 'gold-document':
        go('/support/verification');
        return;
      case 'toggle-hide-badge':
        void setPref('hideVerifiedBadge', next ?? !(status?.preferences?.hideVerifiedBadge ?? false));
        return;
      case 'toggle-hide-gold-label':
        void setPref('hideGoldSellerLabel', next ?? !(status?.preferences?.hideGoldSellerLabel ?? false));
        return;
    }
  };

  const renderRow = (row: HubRow) => (
    <SarhSettingsRow
      key={row.key}
      testID={`verification-hub-${row.key}`}
      icon={row.icon}
      title={row.title}
      subtitle={row.description}
      value={row.value}
      tone={row.tone}
      disabled={busy}
      switchValue={row.switchValue}
      onSwitchChange={
        typeof row.switchValue === 'boolean' && row.action
          ? (next) => runAction(row.action as HubAction, next)
          : undefined
      }
      onPress={row.action ? () => runAction(row.action as HubAction) : undefined}
    />
  );

  return (
    <SettingsScreen title={VERIFICATION_HUB_TITLE} testID="verification-hub">
      {state === 'loading' ? (
        <SettingsStatus state="loading" />
      ) : state === 'error' ? (
        <SettingsStatus
          state="error"
          icon="information-circle-outline"
          message="تعذّر تحميل حالة التوثيق"
          onRetry={() => {
            setState('loading');
            void load();
          }}
        />
      ) : (
        <Animated.View style={{ opacity: fade }}>
          {/* Tier header: badge · tier · state (flat, no card) */}
          <View style={[styles.header, getRtlRow()]} testID="verification-hub-header">
            {model.header.badge ? (
              <TierBadgeMark tier={model.header.badge} size={40} />
            ) : (
              <TierBadgeMark tier="blue" size={40} outline outlineColor={colors.textMuted} />
            )}
            <View style={styles.headerText}>
              <AppText variant="heading3">{model.header.title}</AppText>
              <AppText variant="bodySmall" color="textMuted">
                {model.header.stateLine}
              </AppText>
            </View>
          </View>

          {model.cta ? (
            <View style={styles.cta}>
              <SarhButton
                title={model.cta.title}
                variant="primary"
                shape="pill"
                fullWidth
                onPress={() => runAction(model.cta!.action)}
                testID="verification-hub-cta"
              />
            </View>
          ) : null}

          {model.sections.map((section) => (
            <SarhSettingsSection key={section.key} title={section.title} footer={section.footer}>
              {section.rows.map(renderRow)}
            </SarhSettingsSection>
          ))}
        </Animated.View>
      )}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  cta: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
