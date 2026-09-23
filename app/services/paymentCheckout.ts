import { router } from 'expo-router';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

const APP_SCHEME = 'sarh';

type CheckoutOutcome = 'success' | 'cancel' | 'dismiss';

type PendingCheckout = {
  resolve: (value: CheckoutOutcome) => void;
};

let pendingCheckout: PendingCheckout | null = null;

/** Return deep link used after Network International hosted checkout. */
export function paymentResultDeepLink(params: Record<string, string> = {}): string {
  const base = `${APP_SCHEME}://payment/result`;
  const entries = Object.entries(params).filter(([, value]) => value.length > 0);
  if (entries.length === 0) return base;
  const qs = new URLSearchParams(Object.fromEntries(entries)).toString();
  return `${base}?${qs}`;
}

export function paymentCancelDeepLink(): string {
  return `${APP_SCHEME}://payment/cancel`;
}

/**
 * Resolve the in-flight in-app checkout session (called from checkout screen).
 */
export function completeInAppPaymentCheckout(outcome: CheckoutOutcome): void {
  const pending = pendingCheckout;
  pendingCheckout = null;
  pending?.resolve(outcome);
}

export function isPaymentReturnUrl(url: string): 'result' | 'cancel' | null {
  const lower = url.toLowerCase();
  if (
    lower.startsWith(`${APP_SCHEME}://payment/cancel`) ||
    lower.includes('/payment/cancel')
  ) {
    return 'cancel';
  }
  if (
    lower.startsWith(`${APP_SCHEME}://payment/result`) ||
    lower.includes('/payment/result')
  ) {
    return 'result';
  }
  return null;
}

function openExternalFallback(
  checkoutUrl: string,
  returnParams: Record<string, string>,
): Promise<CheckoutOutcome> {
  const returnUrl = paymentResultDeepLink({ ...returnParams, gatewayReturn: '1' });
  return (async () => {
    try {
      const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, returnUrl);
      if (result.type === 'success') return 'success';
      if (result.type === 'cancel') return 'cancel';
      return 'dismiss';
    } catch {
      try {
        await WebBrowser.openBrowserAsync(checkoutUrl);
      } catch {
        await Linking.openURL(checkoutUrl);
      }
      return 'dismiss';
    }
  })();
}

/**
 * Open NI hosted checkout inside the app (WebView screen).
 * Falls back to an auth-session browser sheet only if navigation fails.
 */
export async function openPaymentCheckout(
  checkoutUrl: string,
  returnParams: Record<string, string> = {},
): Promise<CheckoutOutcome> {
  if (Platform.OS === 'web') {
    // RN WebView on web is an iframe; keep auth-session for cookie/3DS reliability.
    return openExternalFallback(checkoutUrl, returnParams);
  }

  if (pendingCheckout) {
    completeInAppPaymentCheckout('dismiss');
  }

  return new Promise<CheckoutOutcome>((resolve) => {
    pendingCheckout = { resolve };
    try {
      router.push({
        pathname: '/payment/checkout',
        params: {
          checkoutUrl: encodeURIComponent(checkoutUrl),
          paymentId: returnParams.paymentId ?? '',
          context: returnParams.context ?? 'generic',
          listingId: returnParams.listingId ?? '',
          checkoutId: returnParams.checkoutId ?? '',
          orderNumber: returnParams.orderNumber ?? '',
          butcherId: returnParams.butcherId ?? '',
          boostType: returnParams.boostType ?? '',
          durationDays: returnParams.durationDays ?? '',
        },
      } as never);
    } catch {
      pendingCheckout = null;
      void openExternalFallback(checkoutUrl, returnParams).then(resolve);
    }
  });
}
