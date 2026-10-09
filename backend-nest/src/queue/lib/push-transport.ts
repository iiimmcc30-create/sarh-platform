/**
 * Per-platform push routing.
 *
 * - Android registers a native FCM registration token
 *   (`getDevicePushTokenAsync`) → sent through firebase-admin.
 * - iOS registers an Expo push token (`ExponentPushToken[...]`,
 *   `getExpoPushTokenAsync`) → sent through the Expo push service, which
 *   delivers via APNs with the push key stored in the EAS project credentials.
 *   (A raw APNs device token cannot be used with FCM, which is why iOS pushes
 *   never arrived before.)
 * - Raw 64-hex APNs tokens registered by older iOS builds are undeliverable
 *   through either path and are pruned.
 */

export type PushTransport = 'expo' | 'fcm' | 'apns_raw';

const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;
const RAW_APNS_RE = /^[0-9a-f]{64}$/i;

export function isExpoPushToken(token: string): boolean {
  return EXPO_TOKEN_RE.test(token.trim());
}

export function pushTransportFor(token: string): PushTransport {
  const t = token.trim();
  if (EXPO_TOKEN_RE.test(t)) return 'expo';
  if (RAW_APNS_RE.test(t)) return 'apns_raw';
  return 'fcm';
}

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: 'default';
  badge: number;
  priority: 'high';
  channelId: string;
};

export function buildExpoMessage(job: {
  token: string;
  titleAr: string;
  bodyAr: string;
  data?: Record<string, string>;
}): ExpoPushMessage {
  return {
    to: job.token.trim(),
    title: job.titleAr,
    body: job.bodyAr,
    data: job.data ?? {},
    sound: 'default',
    badge: 1,
    priority: 'high',
    channelId: 'default',
  };
}

export type ExpoSendResult =
  | { ok: true; ticketId?: string }
  | { ok: false; unregistered: boolean; retryable: boolean; error: string };

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Send one message through the Expo push API.
 * `EXPO_ACCESS_TOKEN` is optional; when set (and "Enhanced push security" is
 * enabled for the project on expo.dev) it is sent as a Bearer token.
 */
export async function sendExpoPush(
  message: ExpoPushMessage,
  opts: { accessToken?: string; fetchImpl?: FetchLike } = {},
): Promise<ExpoSendResult> {
  const fetchImpl =
    opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  if (opts.accessToken?.trim()) {
    headers.Authorization = `Bearer ${opts.accessToken.trim()}`;
  }

  const res = await fetchImpl(EXPO_PUSH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    return {
      ok: false,
      unregistered: false,
      retryable: res.status === 429 || res.status >= 500,
      error: `expo_http_${res.status}`,
    };
  }

  const raw = (body as { data?: unknown } | null)?.data;
  const ticket = (Array.isArray(raw) ? raw[0] : raw) as
    | {
        status?: string;
        id?: string;
        message?: string;
        details?: { error?: string };
      }
    | undefined;

  if (ticket?.status === 'ok') return { ok: true, ticketId: ticket.id };

  const code = ticket?.details?.error ?? 'expo_error';
  return {
    ok: false,
    unregistered: code === 'DeviceNotRegistered',
    retryable: code === 'MessageRateExceeded',
    error: code,
  };
}
