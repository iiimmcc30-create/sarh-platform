import * as Google from 'expo-auth-session/providers/google';
import { discovery } from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import { ResponseType } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import {
  EXPO_PROXY_REDIRECT,
  resolveIdTokenFromCallbackUrl,
  saveGoogleOAuthPending,
} from '@/services/googleOAuth';

WebBrowser.maybeCompleteAuthSession();

/** Stub so expo-auth-session does not throw when env is missing. */
const UNCONFIGURED_CLIENT_ID = 'unconfigured.apps.googleusercontent.com';

function readClientId(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
}

function isPlaceholderClientId(id: string): boolean {
  if (!id) return true;
  const lower = id.toLowerCase();
  return (
    lower.includes('your_') ||
    lower.includes('your-') ||
    lower === UNCONFIGURED_CLIENT_ID ||
    !lower.includes('.apps.googleusercontent.com')
  );
}

const rawWebClientId = readClientId(
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_CLIENT_ID',
);
const rawIosClientId = readClientId('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');
const rawAndroidClientId = readClientId('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID');

const isConfigured = !isPlaceholderClientId(rawWebClientId);

// Always pass a defined webClientId — Expo throws if it is undefined on web.
const webClientId = isConfigured ? rawWebClientId : UNCONFIGURED_CLIENT_ID;
const iosClientId = !isPlaceholderClientId(rawIosClientId)
  ? rawIosClientId
  : webClientId;
const androidClientId = !isPlaceholderClientId(rawAndroidClientId)
  ? rawAndroidClientId
  : webClientId;

function getProxyStartUrl(authUrl: string, returnUrl: string): string {
  return `${EXPO_PROXY_REDIRECT}/start?${new URLSearchParams({ authUrl, returnUrl }).toString()}`;
}

export type GoogleSignInResult =
  | { ok: true; idToken: string }
  | { ok: false; error: string; cancelled?: boolean };

export function useGoogleSignIn() {
  const useCodeFlow = Platform.OS !== 'web';

  const [request, , promptAsync] = Google.useAuthRequest({
    clientId: webClientId,
    webClientId,
    iosClientId,
    androidClientId,
    redirectUri: EXPO_PROXY_REDIRECT,
    responseType: useCodeFlow ? ResponseType.Code : ResponseType.IdToken,
    scopes: ['openid', 'profile', 'email'],
  });

  const signIn = async (): Promise<GoogleSignInResult> => {
    if (!isConfigured) {
      return { ok: false, error: 'تسجيل Google غير متاح — أضف معرّف العميل في ملف .env' };
    }
    if (!request) {
      return { ok: false, error: 'جاري تهيئة Google، حاول مجدداً بعد لحظة' };
    }

    if (Platform.OS === 'web') {
      const result = await promptAsync();
      if (result.type === 'success') {
        const idToken = result.params.id_token;
        if (idToken) return { ok: true, idToken };
        return { ok: false, error: 'تعذّر الحصول على رمز Google' };
      }
      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { ok: false, error: '', cancelled: true };
      }
      return { ok: false, error: 'تعذّر الاتصال بـ Google' };
    }

    const authUrl = request.url ?? (await request.makeAuthUrlAsync(discovery));
    if (request.codeVerifier) {
      await saveGoogleOAuthPending(request.state, request.codeVerifier);
    }

    const returnUrl = AuthSession.getDefaultReturnUrl();
    const startUrl = getProxyStartUrl(authUrl, returnUrl);
    const browserResult = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);

    if (browserResult.type === 'success') {
      const idToken = await resolveIdTokenFromCallbackUrl(browserResult.url);
      if (idToken) return { ok: true, idToken };

      const parsed = request.parseReturnUrl(browserResult.url);
      if (parsed.type === 'success' && parsed.params.id_token) {
        return { ok: true, idToken: parsed.params.id_token };
      }
      return { ok: false, error: 'تعذّر الحصول على رمز Google' };
    }

    if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') {
      // App may have opened /expo-auth-session via deep link — that screen completes sign-in.
      return { ok: false, error: '', cancelled: true };
    }

    return { ok: false, error: 'تعذّر الاتصال بـ Google' };
  };

  return { signIn, isConfigured, ready: !!request, redirectUri: EXPO_PROXY_REDIRECT };
}
