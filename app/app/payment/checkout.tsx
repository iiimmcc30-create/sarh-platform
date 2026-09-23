/**
 * In-app Network International hosted checkout (WebView).
 * Keeps the shopper inside سرح instead of opening an external browser.
 */
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppText, SarhButton } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import {
  completeInAppPaymentCheckout,
  isPaymentReturnUrl,
} from '@/services/paymentCheckout';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { type ThemeColors } from '@/constants/theme';

function pickParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default function PaymentCheckoutScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const router = useRouter();
  const params = useLocalSearchParams<{
    checkoutUrl?: string | string[];
    paymentId?: string | string[];
    context?: string | string[];
    listingId?: string | string[];
    orderId?: string | string[];
    orderNumber?: string | string[];
    butcherId?: string | string[];
    checkoutId?: string | string[];
    boostType?: string | string[];
    durationDays?: string | string[];
  }>();

  const checkoutUrl = decodeURIComponent(pickParam(params.checkoutUrl));
  const paymentId = pickParam(params.paymentId);
  const context = pickParam(params.context) || 'generic';
  const listingId = pickParam(params.listingId);
  const orderId = pickParam(params.orderId);
  const orderNumber = pickParam(params.orderNumber);
  const butcherId = pickParam(params.butcherId);
  const checkoutId = pickParam(params.checkoutId);
  const boostType = pickParam(params.boostType);
  const durationDays = pickParam(params.durationDays);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const settledRef = useRef(false);

  const resultParams = useMemo(
    () => ({
      paymentId,
      context,
      gatewayReturn: '1',
      ...(listingId ? { listingId } : {}),
      ...(orderId ? { orderId } : {}),
      ...(orderNumber ? { orderNumber } : {}),
      ...(butcherId ? { butcherId } : {}),
      ...(checkoutId ? { checkoutId } : {}),
      ...(boostType ? { boostType } : {}),
      ...(durationDays ? { durationDays } : {}),
    }),
    [
      paymentId,
      context,
      listingId,
      orderId,
      orderNumber,
      butcherId,
      checkoutId,
      boostType,
      durationDays,
    ],
  );

  const finish = useCallback(
    (outcome: 'success' | 'cancel') => {
      if (settledRef.current) return;
      settledRef.current = true;
      completeInAppPaymentCheckout(outcome);

      if (outcome === 'success') {
        router.replace({
          pathname: '/payment/result',
          params: resultParams,
        } as never);
        return;
      }

      router.replace({
        pathname: '/payment/cancel',
        params: resultParams,
      } as never);
    },
    [router, resultParams],
  );

  const handleClose = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    completeInAppPaymentCheckout('cancel');
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace({
        pathname: '/payment/cancel',
        params: resultParams,
      } as never);
    }
  }, [router, resultParams]);

  const handleNavUrl = useCallback(
    (url: string): boolean => {
      const kind = isPaymentReturnUrl(url);
      if (!kind) return true;
      finish(kind === 'result' ? 'success' : 'cancel');
      return false;
    },
    [finish],
  );

  const onShouldStartLoadWithRequest = useCallback(
    (request: { url?: string }) => {
      if (!request.url) return true;
      return handleNavUrl(request.url);
    },
    [handleNavUrl],
  );

  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      if (nav.url) handleNavUrl(nav.url);
    },
    [handleNavUrl],
  );

  if (!checkoutUrl) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader variant="screen" title="إتمام الدفع" showBack onBackPress={handleClose} />
        <ScreenBody scroll={false}>
          <Stack gap="md" align="center" fill style={styles.centered}>
            <AppText variant="body" align="center">تعذّر فتح صفحة الدفع</AppText>
            <SarhButton title="إغلاق" onPress={handleClose} />
          </Stack>
        </ScreenBody>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        variant="screen"
        title="إتمام الدفع"
        showBack
        onBackPress={handleClose}
        rightAccessibilityLabel="إغلاق الدفع"
      />
      <ScreenBody scroll={false} gutter={false}>
        <View style={styles.webWrap}>
          {loading ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.electricBright} />
              <AppText variant="body" color="textSecondary">جارٍ تحميل بوابة الدفع...</AppText>
            </View>
          ) : null}

          {loadError ? (
            <Stack gap="md" align="center" fill style={styles.centered}>
              <AppText variant="body" align="center">{loadError}</AppText>
              <SarhButton title="إغلاق" onPress={handleClose} />
            </Stack>
          ) : (
            <WebView
              source={{ uri: checkoutUrl }}
              style={styles.webview}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setLoadError('تعذّر تحميل صفحة الدفع. حاول مرة أخرى.');
              }}
              onHttpError={(e) => {
                if (e.nativeEvent.statusCode >= 400) {
                  setLoading(false);
                  setLoadError('تعذّر تحميل صفحة الدفع. حاول مرة أخرى.');
                }
              }}
              onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
              onNavigationStateChange={onNavigationStateChange}
              startInLoadingState
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              setSupportMultipleWindows={false}
              originWhitelist={['https://*', 'http://*', 'sarh://*']}
              allowsInlineMediaPlayback
              {...(Platform.OS === 'android'
                ? { mixedContentMode: 'always' as const }
                : {})}
            />
          )}
        </View>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    webWrap: {
      flex: 1,
      position: 'relative',
    },
    webview: {
      flex: 1,
      backgroundColor: colors.bgSurface,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 2,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      backgroundColor: colors.bgDeep,
    },
    centered: {
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
  });
}
