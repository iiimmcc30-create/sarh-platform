import { Alert } from 'react-native';
import { router } from 'expo-router';
import { API_BASE } from './api';
import { openPaymentCheckout } from './paymentCheckout';

export type PaymentContext =
  | 'subscription'
  | 'listing_fee'
  | 'commission'
  | 'boost'
  | 'promotion'
  | 'butcher_order'
  | 'butcher_checkout'
  | 'generic';

export type InitiatedPayment = {
  paymentId?: string;
  checkoutUrl?: string;
  devMode?: boolean;
  boostId?: string;
};

export async function devCompletePayment(
  accessToken: string,
  paymentId: string,
): Promise<{ ok: boolean; status?: string; message?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/payments/${paymentId}/dev-complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success) {
      return { ok: true, status: json.data?.status ?? 'paid' };
    }
    return {
      ok: false,
      message: json.messageAr ?? json.message ?? 'فشل إتمام الدفع التجريبي',
    };
  } catch {
    return { ok: false, message: 'تعذّر الاتصال بالخادم' };
  }
}

export type PaymentSyncResult = {
  status: 'paid' | 'pending' | 'failed' | 'cancelled' | 'not_found' | 'rate_limited';
  messageAr?: string;
  butcherOrder?: {
    id: string;
    orderNumber?: string;
    butcherId?: string;
    paymentStatus?: string;
    status?: string;
  };
  boost?: {
    boostType: string;
    expiresAt?: string;
    listingId?: string;
  };
  promotion?: {
    expiresAt?: string;
    listingId?: string;
  };
};

const PAYMENT_CANCEL_MESSAGE_AR = 'تم إلغاء عملية الدفع.';

const syncInflight = new Map<string, Promise<PaymentSyncResult>>();

function mapSyncResponse(res: Response, json: Record<string, unknown>): PaymentSyncResult {
  if (res.status === 429) {
    return {
      status: 'rate_limited',
      messageAr: 'طلبات كثيرة. انتظر قليلاً ثم أعد التحقق.',
    };
  }
  if (res.status === 404) {
    return { status: 'not_found', messageAr: PAYMENT_CANCEL_MESSAGE_AR };
  }
  if (!res.ok || !json.success) {
    return { status: 'cancelled', messageAr: PAYMENT_CANCEL_MESSAGE_AR };
  }

  const data = (json.data ?? {}) as Record<string, unknown>;
  const outcome = String(data.outcome ?? '');
  const messageAr =
    typeof data.messageAr === 'string' ? data.messageAr : undefined;

  if (outcome === 'success' || data.status === 'paid') {
    const butcherRaw = data.butcherOrder;
    const butcherOrder =
      butcherRaw && typeof butcherRaw === 'object'
        ? {
            id: String((butcherRaw as Record<string, unknown>).id ?? ''),
            orderNumber:
              typeof (butcherRaw as Record<string, unknown>).orderNumber === 'string'
                ? ((butcherRaw as Record<string, unknown>).orderNumber as string)
                : undefined,
            butcherId:
              typeof (butcherRaw as Record<string, unknown>).butcherId === 'string'
                ? ((butcherRaw as Record<string, unknown>).butcherId as string)
                : undefined,
            paymentStatus:
              typeof (butcherRaw as Record<string, unknown>).paymentStatus === 'string'
                ? ((butcherRaw as Record<string, unknown>).paymentStatus as string)
                : undefined,
            status:
              typeof (butcherRaw as Record<string, unknown>).status === 'string'
                ? ((butcherRaw as Record<string, unknown>).status as string)
                : undefined,
          }
        : undefined;
    const boostRaw = data.boost;
    const boost =
      boostRaw && typeof boostRaw === 'object'
        ? {
            boostType: String((boostRaw as Record<string, unknown>).boostType ?? ''),
            expiresAt:
              typeof (boostRaw as Record<string, unknown>).expiresAt === 'string'
                ? (boostRaw as Record<string, unknown>).expiresAt as string
                : undefined,
            listingId:
              typeof (boostRaw as Record<string, unknown>).listingId === 'string'
                ? (boostRaw as Record<string, unknown>).listingId as string
                : undefined,
          }
        : undefined;
    const promotionRaw = data.promotion;
    const promotion =
      promotionRaw && typeof promotionRaw === 'object'
        ? {
            expiresAt:
              typeof (promotionRaw as Record<string, unknown>).expiresAt === 'string'
                ? (promotionRaw as Record<string, unknown>).expiresAt as string
                : undefined,
            listingId:
              typeof (promotionRaw as Record<string, unknown>).listingId === 'string'
                ? (promotionRaw as Record<string, unknown>).listingId as string
                : undefined,
          }
        : undefined;
    return { status: 'paid', messageAr, butcherOrder, boost, promotion };
  }

  if (outcome === 'failed' || data.status === 'failed') {
    return { status: 'cancelled', messageAr: PAYMENT_CANCEL_MESSAGE_AR };
  }

  return { status: 'pending', messageAr };
}

export async function syncPaymentStatus(
  accessToken: string,
  paymentId: string,
): Promise<PaymentSyncResult> {
  const inflight = syncInflight.get(paymentId);
  if (inflight) return inflight;

  const promise = (async (): Promise<PaymentSyncResult> => {
    try {
      const res = await fetch(`${API_BASE}/api/payments/${paymentId}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return mapSyncResponse(res, json);
    } catch {
      return { status: 'cancelled', messageAr: PAYMENT_CANCEL_MESSAGE_AR };
    }
  })().finally(() => {
    syncInflight.delete(paymentId);
  });

  syncInflight.set(paymentId, promise);
  return promise;
}

type LaunchPaymentOptions = {
  accessToken: string;
  paymentId?: string;
  checkoutUrl?: string;
  devMode?: boolean;
  alreadyPaid?: boolean;
  status?: 'pending' | 'paid' | 'refunded' | string;
  context?: PaymentContext;
  returnParams?: Record<string, string>;
};

function goToPaymentResult(
  paymentId: string,
  context: PaymentContext,
  returnParams?: Record<string, string>,
) {
  router.replace({
    pathname: '/payment/result',
    params: {
      paymentId,
      context,
      gatewayReturn: '1',
      ...returnParams,
    },
  } as never);
}

function navigateAfterPaymentCancelled(
  context: PaymentContext,
  returnParams?: Record<string, string>,
) {
  Alert.alert('تم إلغاء عملية الدفع', 'لم تُخصم أي مبالغ. يمكنك المحاولة مرة أخرى متى شئت.');

  switch (context) {
    case 'boost':
    case 'promotion':
      if (returnParams?.listingId) {
        router.replace({
          pathname: '/listing/[id]',
          params: { id: returnParams.listingId },
        } as never);
      } else {
        router.back();
      }
      break;
    case 'subscription':
    case 'listing_fee':
      router.replace('/promote' as never);
      break;
    case 'commission':
      if (returnParams?.listingId) {
        router.replace({
          pathname: '/listing/[id]',
          params: { id: returnParams.listingId },
        } as never);
      } else {
        router.replace('/promote' as never);
      }
      break;
    case 'butcher_order':
    case 'butcher_checkout':
      break;
    default:
      router.replace('/(tabs)/profile' as never);
  }
}

/** Unified checkout: dev test payment or NI hosted page. */
export async function launchPaymentCheckout(
  options: LaunchPaymentOptions,
): Promise<'paid' | 'opened' | 'cancelled' | 'failed'> {
  const {
    accessToken,
    paymentId,
    checkoutUrl,
    devMode,
    alreadyPaid,
    status,
    context = 'generic',
    returnParams,
  } = options;

  if (alreadyPaid || status === 'paid' || status === 'refunded') {
    if (!paymentId) return 'failed';
    goToPaymentResult(paymentId, context, returnParams);
    return 'paid';
  }

  if (devMode) {
    if (!paymentId) return 'failed';

    return new Promise((resolve) => {
      Alert.alert(
        'وضع الاختبار',
        'بوابة الدفع في وضع التطوير.\n\nيمكنك إتمام دفع تجريبي الآن لاختبار الاشتراك والخدمات قبل الإطلاق.',
        [
          { text: 'إلغاء', style: 'cancel', onPress: () => resolve('cancelled') },
          {
            text: 'إتمام دفع تجريبي',
            onPress: () => {
              void (async () => {
                const result = await devCompletePayment(accessToken, paymentId);
                if (result.ok) {
                  goToPaymentResult(paymentId, context, returnParams);
                  resolve('paid');
                } else {
                  Alert.alert('فشل الدفع', result.message ?? 'تعذّر إتمام الدفع التجريبي');
                  resolve('failed');
                }
              })();
            },
          },
        ],
      );
    });
  }

  if (!checkoutUrl) return 'failed';

  const resultParams: Record<string, string> = {
    paymentId: paymentId ?? '',
    context,
    gatewayReturn: '1',
    ...returnParams,
  };

  const sessionResult = await openPaymentCheckout(checkoutUrl, resultParams);

  if (!paymentId) {
    return sessionResult === 'success' ? 'opened' : 'cancelled';
  }

  // In-app WebView already navigated to /payment/result on success.
  if (sessionResult === 'success') {
    return 'opened';
  }

  const sync = await syncPaymentStatus(accessToken, paymentId);
  if (sync.status === 'paid') {
    goToPaymentResult(paymentId, context, returnParams);
    return 'paid';
  }

  // User closed the in-app sheet / cancelled — avoid stacking cancel alerts
  // when checkout already moved to /payment/cancel.
  if (sessionResult === 'cancel' && (context === 'butcher_order' || context === 'butcher_checkout')) {
    return 'cancelled';
  }

  if (context !== 'butcher_order' && context !== 'butcher_checkout') {
    // Checkout screen already shows /payment/cancel for explicit gateway cancel.
    // Only alert when the sheet was dismissed without a gateway redirect.
    if (sessionResult === 'dismiss') {
      navigateAfterPaymentCancelled(context, returnParams);
    }
  }
  return 'cancelled';
}
