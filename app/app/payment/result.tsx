// Payment result screen — single NI sync after gateway redirect (no auto-polling).
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { AppText, SarhButton } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/hooks/useApp';
import {
  syncPaymentStatus,
  type PaymentContext,
  type PaymentSyncResult,
} from '@/services/payments';
import { boostSuccessMessage } from '@/services/listingBoost';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { type ThemeColors } from '@/constants/theme';

type SyncState = 'syncing' | 'paid' | 'pending' | 'cancelled';

type ContextCopy = {
  successTitle: string;
  successSubtitle: string;
  pendingSubtitle: string;
  primaryLabel: string;
  secondaryLabel?: string;
};

const CONTEXT_COPY: Record<PaymentContext, ContextCopy> = {
  subscription: {
    successTitle: 'تم تفعيل الاشتراك!',
    successSubtitle: 'تم تأكيد الدفع من N-Genius واشتراكك أصبح نشطاً.',
    pendingSubtitle:
      'العملية قيد المعالجة في N-Genius. اضغط «إعادة التحقق» إذا لم يُحدَّث الحساب بعد.',
    primaryLabel: 'الملف الشخصي',
    secondaryLabel: 'خدمات الترويج',
  },
  listing_fee: {
    successTitle: 'تم الدفع بنجاح',
    successSubtitle: 'تم تأكيد عملية الدفع من N-Genius.',
    pendingSubtitle: 'العملية قيد المعالجة. اضغط «إعادة التحقق» إذا لم يُحدَّث الطلب.',
    primaryLabel: 'الاشتراك',
  },
  commission: {
    successTitle: 'تم سداد الرسوم بنجاح',
    successSubtitle: 'تم سداد الرسوم بنجاح، شكراً لك.',
    pendingSubtitle: 'العملية قيد المعالجة. اضغط «إعادة التحقق» إذا لم يُسجَّل السداد.',
    primaryLabel: 'عرض الإعلان',
  },
  promotion: {
    successTitle: 'تم تفعيل الترويج!',
    successSubtitle: 'تم تأكيد الدفع من N-Genius.',
    pendingSubtitle: 'العملية قيد المعالجة. اضغط «إعادة التحقق» إذا لم يُفعَّل الترويج.',
    primaryLabel: 'عرض الإعلان',
    secondaryLabel: 'خدمات الترويج',
  },
  boost: {
    successTitle: 'تم تفعيل الترقية!',
    successSubtitle: 'تم تأكيد الدفع من N-Genius.',
    pendingSubtitle: 'العملية قيد المعالجة. اضغط «إعادة التحقق» إذا لم تُفعَّل الترقية.',
    primaryLabel: 'عرض الإعلان',
  },
  butcher_order: {
    successTitle: 'تم الدفع بنجاح',
    successSubtitle: 'تم تأكيد عملية الدفع من N-Genius.',
    pendingSubtitle: 'العملية قيد المعالجة. اضغط «إعادة التحقق» إذا لم يُحدَّث الطلب.',
    primaryLabel: 'الرئيسية',
  },
  butcher_checkout: {
    successTitle: 'تم الدفع بنجاح',
    successSubtitle: 'تم تأكيد عملية الدفع من N-Genius.',
    pendingSubtitle: 'العملية قيد المعالجة. اضغط «إعادة التحقق» إذا لم يُحدَّث الطلب.',
    primaryLabel: 'الرئيسية',
  },
  generic: {
    successTitle: 'تم الدفع بنجاح!',
    successSubtitle: 'تم تأكيد عملية الدفع من N-Genius.',
    pendingSubtitle: 'العملية قيد المعالجة. اضغط «إعادة التحقق» إذا لم يُحدَّث الحساب.',
    primaryLabel: 'الملف الشخصي',
    secondaryLabel: 'خدمات الترويج',
  },
};

function normalizeContext(raw?: string): PaymentContext {
  const allowed: PaymentContext[] = [
    'subscription',
    'listing_fee',
    'commission',
    'boost',
    'promotion',
    'butcher_order',
    'butcher_checkout',
    'generic',
  ];
  if (raw && allowed.includes(raw as PaymentContext)) {
    return raw as PaymentContext;
  }
  return 'generic';
}

function mapSyncToState(result: PaymentSyncResult): SyncState {
  if (result.status === 'paid') return 'paid';
  if (
    result.status === 'cancelled' ||
    result.status === 'failed' ||
    result.status === 'not_found'
  ) {
    return 'cancelled';
  }
  return 'pending';
}

export default function PaymentResultScreen() {
  const { colors, gradients } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const router = useRouter();
  const params = useLocalSearchParams<{
    paymentId?: string;
    context?: string;
    listingId?: string;
    orderId?: string;
    orderNumber?: string;
    butcherId?: string;
    checkoutId?: string;
    boostType?: string;
    durationDays?: string;
    gatewayReturn?: string;
  }>();
  const {
    paymentId,
    context: rawContext,
    listingId,
    orderId,
    orderNumber,
    butcherId,
    checkoutId: _checkoutId,
    boostType: paramBoostType,
    durationDays: paramDurationDays,
  } = params;
  const context = normalizeContext(rawContext);
  const copy = CONTEXT_COPY[context];
  const { refetchSubscription } = useSubscription();
  const { refetchData } = useApp();
  const { accessToken } = useAuth();
  const [syncState, setSyncState] = useState<SyncState>('syncing');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [boostExpiry, setBoostExpiry] = useState<string | null>(null);
  const [resolvedBoostType, setResolvedBoostType] = useState<string | null>(null);
  const [paidOrderId, setPaidOrderId] = useState<string>(orderId ?? '');
  const [paidOrderNumber, setPaidOrderNumber] = useState<string>(orderNumber ?? '');
  const [paidButcherId, setPaidButcherId] = useState<string>(butcherId ?? '');
  const [retrying, setRetrying] = useState(false);
  const syncInflightRef = useRef(false);
  const initialSyncDoneRef = useRef(false);

  const isButcherContext = context === 'butcher_order' || context === 'butcher_checkout';

  const applyPaidSideEffects = useCallback(
    async (result: PaymentSyncResult) => {
      await refetchSubscription();
      if (result.butcherOrder?.id) {
        setPaidOrderId(result.butcherOrder.id);
        if (result.butcherOrder.orderNumber) {
          setPaidOrderNumber(result.butcherOrder.orderNumber);
        }
        if (result.butcherOrder.butcherId) {
          setPaidButcherId(result.butcherOrder.butcherId);
        }
      }
      if (context === 'boost' || context === 'promotion') {
        await refetchData();
        if (result.boost?.expiresAt) {
          setBoostExpiry(result.boost.expiresAt);
        }
        if (result.promotion?.expiresAt) {
          setBoostExpiry(result.promotion.expiresAt);
        }
        if (result.boost?.boostType) {
          setResolvedBoostType(result.boost.boostType);
        } else if (context === 'promotion') {
          setResolvedBoostType('promotion');
        }
      }
    },
    [refetchSubscription, context, refetchData],
  );

  const runSyncOnce = useCallback(async (): Promise<SyncState> => {
    if (!paymentId || !accessToken) {
      return 'cancelled';
    }
    if (syncInflightRef.current) {
      return 'pending';
    }

    syncInflightRef.current = true;
    try {
      const result = await syncPaymentStatus(accessToken, paymentId);
      if (result.messageAr) {
        setStatusMessage(result.messageAr);
      }
      const state = mapSyncToState(result);
      if (state === 'paid') {
        await applyPaidSideEffects(result);
      }
      return state;
    } finally {
      syncInflightRef.current = false;
    }
  }, [paymentId, accessToken, applyPaidSideEffects]);

  useEffect(() => {
    if (!paymentId || !accessToken) {
      setSyncState('cancelled');
      setStatusMessage('تم إلغاء عملية الدفع.');
      return;
    }
    if (initialSyncDoneRef.current) return;
    initialSyncDoneRef.current = true;

    let alive = true;
    setSyncState('syncing');
    void (async () => {
      const state = await runSyncOnce();
      if (alive) setSyncState(state);
    })();

    return () => {
      alive = false;
    };
  }, [paymentId, accessToken, runSyncOnce]);

  const retrySync = useCallback(() => {
    if (retrying || syncInflightRef.current) return;
    setRetrying(true);
    void (async () => {
      setSyncState('syncing');
      const state = await runSyncOnce();
      setSyncState(state);
      setRetrying(false);
    })();
  }, [runSyncOnce, retrying]);

  const goPrimary = useCallback(() => {
    switch (context) {
      case 'subscription':
        router.replace('/(tabs)/profile' as never);
        break;
      case 'listing_fee':
        router.replace('/promote' as never);
        break;
      case 'commission':
        if (listingId) {
          router.replace({ pathname: '/listing/[id]', params: { id: listingId } } as never);
        } else {
          router.replace('/promote' as never);
        }
        break;
      case 'boost':
      case 'promotion':
        if (listingId) {
          router.replace({ pathname: '/listing/[id]/promote', params: { id: listingId } } as never);
        } else {
          router.replace('/promote' as never);
        }
        break;
      case 'butcher_order':
      case 'butcher_checkout':
        router.replace('/(tabs)' as never);
        break;
      default:
        router.replace('/(tabs)/profile' as never);
    }
  }, [context, listingId, paidOrderId, paidOrderNumber, paidButcherId, router, syncState]);

  const goSecondary = useCallback(() => {
    if (context === 'subscription') {
      router.replace('/subscription' as never);
      return;
    }
    if (context === 'butcher_order' || context === 'butcher_checkout') {
      router.replace('/(tabs)' as never);
      return;
    }
    if (context === 'boost' || context === 'promotion') {
      router.replace('/promote' as never);
      return;
    }
    router.replace('/promote' as never);
  }, [context, router]);

  const iconTint =
    syncState === 'paid'
      ? colors.emerald
      : syncState === 'cancelled'
        ? colors.rose
        : colors.amber;

  const body = (() => {
    if (syncState === 'syncing') {
      return (
        <>
          <ActivityIndicator size="large" color={colors.electricBright} />
          <AppText variant="heading2" align="center">جارٍ التحقق من N-Genius...</AppText>
          <AppText variant="body" color="textSecondary" align="center">
            {isButcherContext
              ? 'جارٍ التحقق من حالة العملية في N-Genius'
              : context === 'subscription'
                ? 'لا يُفعَّل الاشتراك قبل تأكيد بوابة الدفع'
                : 'جارٍ التحقق من حالة العملية في N-Genius'}
          </AppText>
        </>
      );
    }

    if (syncState === 'paid') {
      const effectiveBoostType = resolvedBoostType ?? paramBoostType ?? 'pinned';
      const boostSubtitle =
        context === 'boost'
          ? boostSuccessMessage(effectiveBoostType, boostExpiry ?? undefined)
          : copy.successSubtitle;
      return (
        <>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.emerald}22` }]}>
            <AppIcon name="checkmark-circle" size={52} color={iconTint} />
          </View>
          <AppText variant="heading2" align="center">{copy.successTitle}</AppText>
          <AppText variant="body" color="textSecondary" align="center">{boostSubtitle}</AppText>
          {context === 'boost' && paramDurationDays ? (
            <AppText variant="caption" color="textMuted" align="center">
              مدة الترقية: {paramDurationDays === '7' ? '٧ أيام' : '٣ أيام'}
            </AppText>
          ) : null}
          <SarhButton title={copy.primaryLabel} fullWidth onPress={goPrimary} />
          {copy.secondaryLabel ? (
            <SarhButton title={copy.secondaryLabel} variant="ghost" fullWidth onPress={goSecondary} />
          ) : null}
        </>
      );
    }

    if (syncState === 'cancelled') {
      return (
        <>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.rose}22` }]}>
            <AppIcon name="close-circle" size={52} color={iconTint} />
          </View>
          <AppText variant="heading2" align="center">تم إلغاء عملية الدفع</AppText>
          <AppText variant="body" color="textSecondary" align="center">
            {statusMessage ?? 'لم تُخصم أي مبالغ. يمكنك المحاولة مرة أخرى متى شئت.'}
          </AppText>
          <SarhButton title={copy.primaryLabel} fullWidth onPress={goPrimary} />
        </>
      );
    }

    return (
      <>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.amber}22` }]}>
          <AppIcon name="time-outline" size={52} color={iconTint} />
        </View>
        <AppText variant="heading2" align="center">العملية قيد المعالجة</AppText>
        <AppText variant="body" color="textSecondary" align="center">
          {statusMessage ?? copy.pendingSubtitle}
        </AppText>
        <SarhButton
          title={retrying ? 'جارٍ التحقق...' : 'إعادة التحقق'}
          fullWidth
          loading={retrying}
          onPress={retrySync}
        />
        <SarhButton title={copy.primaryLabel} variant="ghost" fullWidth onPress={goPrimary} />
        {copy.secondaryLabel ? (
          <SarhButton title={copy.secondaryLabel} variant="ghost" fullWidth onPress={goSecondary} />
        ) : null}
      </>
    );
  })();

  return (
    <Screen edges={['top', 'bottom']} pattern={false} style={styles.screen}>
      <LinearGradient colors={gradients.hero} style={StyleSheet.absoluteFill} />
      <ScreenBody scroll={false} padTop="xl" padBottom="xl">
        <Stack gap="lg" align="center" fill style={styles.wrap}>
          {body}
        </Stack>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1 },
    wrap: { justifyContent: 'center' },
    iconWrap: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
