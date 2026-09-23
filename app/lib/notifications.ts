// SAFAT — Push notifications (Expo Notifications + FCM device token)

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Router } from 'expo-router';
import { safePush } from '@/lib/safeNavigate';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';

const PUSH_TOKEN_KEY = 'safat_push_token';
const PUSH_TOKEN_SYNCED_KEY = 'safat_push_token_synced';

let foregroundHandlerConfigured = false;

function isExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient';
}

function logPushDebug(message: string, extra?: unknown): void {
  if (__DEV__) {
    console.log(`[SAFAT push] ${message}`, extra ?? '');
  }
}

export type NotificationRouteContext = {
  router: Router;
  isAdmin: boolean;
};

function configureForegroundHandler(): void {
  if (foregroundHandlerConfigured || Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  foregroundHandlerConfigured = true;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'إشعارات صفاة',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1E6FF1',
    sound: 'default',
  });
}

/** Read the last locally cached device push token. */
export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Request permission (once per undetermined state) and obtain native FCM/APNs token.
 * Returns null on denial, simulator, web, or fetch failure — never throws.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;

  if (isExpoGo()) {
    logPushDebug('تخطي التسجيل — Expo Go لا يدعم إشعارات FCM. افتحي تطبيق الصفاة المثبّت.');
    return null;
  }

  configureForegroundHandler();

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      logPushDebug('لم يُمنح إذن الإشعارات', finalStatus);
      return null;
    }

    await ensureAndroidChannel();

    const deviceToken = await Notifications.getDevicePushTokenAsync();
    const token = typeof deviceToken.data === 'string' ? deviceToken.data : String(deviceToken.data);
    if (!token) {
      logPushDebug('لم يُرجع الجهاز FCM token');
      return null;
    }

    logPushDebug('FCM token OK', `${token.slice(0, 20)}...`);
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    return token;
  } catch (err) {
    logPushDebug('فشل تسجيل الإشعارات', err instanceof Error ? err.message : err);
    return null;
  }
}

/** PUT /api/users/:id — only when token changed since last successful sync. */
export async function syncPushToken(userId: string): Promise<void> {
  try {
    let token = await getStoredPushToken();
    if (!token) {
      token = await registerForPushNotifications();
    }
    if (!token) return;

    const lastSynced = await AsyncStorage.getItem(PUSH_TOKEN_SYNCED_KEY);
    if (lastSynced === token) return;

    const res = await authFetch(`${API_BASE}/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcmToken: token,
        fcmPlatform: Platform.OS,
      }),
    });

    if (res.ok) {
      await AsyncStorage.setItem(PUSH_TOKEN_SYNCED_KEY, token);
      logPushDebug('تم رفع FCM token للسيرفر');
    } else {
      logPushDebug('فشل رفع FCM token', res.status);
    }
  } catch (err) {
    logPushDebug('خطأ شبكة أثناء رفع FCM token', err instanceof Error ? err.message : err);
  }
}

export function listenForegroundNotifications(): Notifications.EventSubscription {
  configureForegroundHandler();
  return Notifications.addNotificationReceivedListener(() => {
    // Foreground display handled by setNotificationHandler
  });
}

export function listenNotificationResponses(
  onResponse: (data: Record<string, unknown>) => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const raw = response.notification.request.content.data;
    onResponse(normalizeNotificationData(raw));
  });
}

/** Handle cold-start tap when app launched from a notification. */
export async function getInitialNotificationData(): Promise<Record<string, unknown> | null> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return null;
    return normalizeNotificationData(response.notification.request.content.data);
  } catch {
    return null;
  }
}

export function cleanupListeners(subscriptions: Array<Notifications.EventSubscription | null>): void {
  for (const sub of subscriptions) {
    sub?.remove();
  }
}

function normalizeNotificationData(
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === 'string' ? value : String(value);
  }
  return out;
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function resolveNavigationInput(
  input: NotificationNavigationInput | Record<string, unknown> | undefined,
): { type: string; data: Record<string, unknown> } {
  if (!input || typeof input !== 'object') {
    return { type: '', data: {} };
  }

  if ('type' in input && typeof (input as NotificationNavigationInput).type === 'string') {
    const typed = input as NotificationNavigationInput;
    const data =
      typed.data && typeof typed.data === 'object' && !Array.isArray(typed.data)
        ? (typed.data as Record<string, unknown>)
        : {};
    return { type: typed.type ?? '', data };
  }

  const data = input as Record<string, unknown>;
  const type = stringField(data, 'type') ?? '';
  return { type, data };
}

function routeId(value: string): string {
  return String(value ?? '').trim();
}

/** Live order details — butcher order routes are removed from Sarh. */
function openOrderDetails(_ctx: NotificationRouteContext, _orderId: string): boolean {
  return false;
}

/** Live support ticket — refetch by ticket id, ignore payload snapshot. */
function openSupportTicket(ctx: NotificationRouteContext, ticketId: string): boolean {
  const id = routeId(ticketId);
  if (!id) return false;
  return safePush(
    {
      pathname: '/support/tickets/[id]',
      params: { id, fresh: String(Date.now()) },
    } as never,
    { force: true },
    ctx.router,
  );
}

function navigateToPost(
  ctx: NotificationRouteContext,
  postId: string,
  openComments = false,
): boolean {
  const id = String(postId ?? '').trim();
  if (!id) return false;

  return safePush(
    openComments
      ? (`/post/${encodeURIComponent(id)}?focusComment=1` as never)
      : (`/post/${encodeURIComponent(id)}` as never),
    undefined,
    ctx.router,
  );
}

export type NotificationNavigationInput = {
  type?: string;
  data?: Record<string, unknown> | null;
};

/** Navigate based on notification type + data payload. */
export function handleNotificationNavigation(
  input: NotificationNavigationInput | Record<string, unknown> | undefined,
  ctx: NotificationRouteContext,
  options?: { stayOnUnknown?: boolean },
): boolean {
  const { type, data } = resolveNavigationInput(input);
  const event = stringField(data, 'event');

  if (event) {
    switch (event) {
      case 'butcher_application_received':
      case 'butcher_application_withdrawn':
      case 'butcher_application_submitted':
      case 'butcher_application_approved':
      case 'butcher_application_rejected':
        return false;

      case 'support_ticket_created':
      case 'support_ticket_staff_reply':
      case 'support_ticket_staff_new':
      case 'support_ticket_user_reply':
      case 'support_ticket_status_changed':
      case 'support_ticket_awaiting_user':
      case 'support_ticket_closed': {
        const ticketId = stringField(data, 'ticketId');
        if (ticketId && openSupportTicket(ctx, ticketId)) return true;
        safePush('/support/tickets' as never, undefined, ctx.router);
        return true;
      }

      case 'account_verification_received':
      case 'account_verification_review_started':
      case 'account_verification_needs_amendments':
      case 'account_verification_approved':
      case 'account_verification_rejected':
        safePush('/support/verification' as never, undefined, ctx.router);
        return true;
    }
  }

  const postId = stringField(data, 'postId');
  const listingId = stringField(data, 'listingId');
  const streamId = stringField(data, 'streamId');
  const orderId = stringField(data, 'orderId');
  const threadId = stringField(data, 'threadId');
  const paymentId = stringField(data, 'paymentId');

  switch (type) {
    case 'like':
    case 'repost':
      if (postId) return navigateToPost(ctx, postId);
      break;

    case 'comment':
      if (postId) return navigateToPost(ctx, postId, true);
      break;

    case 'follow': {
      const actorId =
        stringField(data, 'actorId') ??
        stringField(data, 'followerId') ??
        stringField(data, 'userId');
      if (actorId) {
        safePush({
          pathname: '/users/[id]',
          params: { id: actorId },
        } as never, undefined, ctx.router);
        return true;
      }
      safePush('/notifications' as never, undefined, ctx.router);
      return true;
    }

    case 'live_start':
      if (streamId) {
        safePush({
          pathname: '/live/watch/[id]',
          params: { id: streamId },
        } as never, undefined, ctx.router);
        return true;
      }
      break;

    case 'order_update':
      if (orderId && openOrderDetails(ctx, orderId)) return true;
      break;

    case 'fee_due':
      if (listingId) {
        safePush({
          pathname: '/listing/[id]',
          params: { id: listingId },
        } as never, undefined, ctx.router);
        return true;
      }
      safePush('/subscription' as never, undefined, ctx.router);
      return true;

    case 'subscription_renew':
      safePush('/subscription' as never, undefined, ctx.router);
      return true;

    case 'new_message':
      if (threadId) {
        const senderId = stringField(data, 'senderId') ?? stringField(data, 'actorId');
        const threadType = stringField(data, 'threadType');
        safePush({
          pathname: '/chat',
          params: {
            threadId,
            ...(senderId ? { receiverId: senderId } : {}),
            ...(threadType && threadType !== 'BUTCHER' ? { threadType } : {}),
          },
        } as never, undefined, ctx.router);
        return true;
      }
      if (stringField(data, 'threadType') === 'BUTCHER') {
        safePush({
          pathname: '/(tabs)/messages',
        } as never, undefined, ctx.router);
        return true;
      }
      safePush({
        pathname: '/(tabs)/profile',
        params: { tab: 'messages' },
      } as never, undefined, ctx.router);
      return true;

    case 'offer':
      break;

    case 'system': {
      const ticketId = stringField(data, 'ticketId');
      if (ticketId && openSupportTicket(ctx, ticketId)) return true;
      if (orderId && openOrderDetails(ctx, orderId)) return true;
      if (postId) return navigateToPost(ctx, postId);
      if (paymentId) {
        safePush('/subscription' as never, undefined, ctx.router);
        return true;
      }
      break;
    }
  }

  if (options?.stayOnUnknown) return false;
  return false;
}

/** Clear local push token cache and remove FCM token from the server on logout. */
export async function clearPushTokenOnLogout(
  userId: string,
  accessToken: string,
): Promise<void> {
  try {
    const stored = await getStoredPushToken();
    await fetch(`${API_BASE}/api/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(
        stored
          ? { fcmToken: stored, unregisterFcm: true, fcmPlatform: Platform.OS }
          : { fcmToken: null },
      ),
    });
  } catch {
    // silent — local cleanup still runs
  }

  try {
    await AsyncStorage.multiRemove([PUSH_TOKEN_KEY, PUSH_TOKEN_SYNCED_KEY]);
  } catch {
    // ignore
  }
}

/** Expo project id — used when resolving push credentials in EAS builds. */
export function getExpoProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | null)?.projectId ??
    undefined
  );
}
