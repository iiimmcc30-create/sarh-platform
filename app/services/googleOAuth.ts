import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessTokenRequest } from 'expo-auth-session';
import { discovery } from 'expo-auth-session/providers/google';
import { extractOAuthParams } from '@/lib/googleOAuthCallback';

const PENDING_KEY = 'safat_google_oauth_pending';

const webClientId =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ??
  '';

export const EXPO_PROXY_REDIRECT =
  process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI ??
  'https://auth.expo.io/@zeinabmostafa/safat';

export async function saveGoogleOAuthPending(state: string, codeVerifier: string) {
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ state, codeVerifier }));
}

export async function clearGoogleOAuthPending() {
  await AsyncStorage.removeItem(PENDING_KEY);
}

/** Resolve id_token from OAuth callback URL (implicit hash or PKCE code exchange). */
export async function resolveIdTokenFromCallbackUrl(url: string): Promise<string | null> {
  const params = extractOAuthParams(url);

  if (params.id_token) {
    await clearGoogleOAuthPending();
    return params.id_token;
  }

  if (!params.code || !webClientId) return null;

  const pendingRaw = await AsyncStorage.getItem(PENDING_KEY);
  if (!pendingRaw) return null;

  let pending: { codeVerifier?: string };
  try {
    pending = JSON.parse(pendingRaw);
  } catch {
    return null;
  }

  try {
    const exchange = new AccessTokenRequest({
      clientId: webClientId,
      redirectUri: EXPO_PROXY_REDIRECT,
      code: params.code,
      extraParams: {
        code_verifier: pending.codeVerifier ?? '',
      },
    });
    const token = await exchange.performAsync(discovery);
    await clearGoogleOAuthPending();
    return token.idToken ?? null;
  } catch {
    await clearGoogleOAuthPending();
    return null;
  }
}
