// Powered by OnSpace.AI
// SAFAT — Auth Context (JWT + OTP + Google)

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerAuthFetch } from '@/services/authFetch';
import { fetchWithTimeout } from '@/services/fetchWithTimeout';
import { API_BASE } from '@/services/api';
import { clearPushTokenOnLogout } from '@/lib/notifications';
import { normalizeAuthUser } from '@/lib/currentUser';
import { parseActiveMode } from '@/lib/activeMode';
import {
  evaluatePersistedTokens,
  evaluateRefreshResult,
  isSessionStillTrusted,
} from '@/lib/sessionRefresh';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  phone?: string;
  email?: string;
  displayName: string;
  arabicName?: string;
  username: string;
  avatar?: string;
  verified: boolean;
  country?: string;
  role?: string;
  subscription?: { plan: string; expiresAt: string } | null;
}

interface GoogleSignInData {
  googleId?: string;
  email?: string;
  displayName?: string;
  avatar?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  // TODO(Migration): replace activeMode with capability-based navigation after Butcher Application workflow.
  activeMode: 'USER' | 'BUTCHER';
  switchMode: (mode: 'USER' | 'BUTCHER') => void;
  // OTP flow
  sendOtp:   (
    phone: string,
    channel?: 'sms' | 'whatsapp',
    purpose?: 'login' | 'signup' | 'join' | 'reset_password',
  ) => Promise<{ success: boolean; devMode?: boolean; error?: string; code?: string }>;
  verifyOtp: (
    phone: string,
    code: string,
    purpose?: 'login' | 'reset_password' | 'signup' | 'join',
  ) => Promise<{ success: boolean; isNew?: boolean; phone?: string; phoneToken?: string; error?: string; code?: string }>;
  checkSignup: (fields: {
    phone?: string;
    username?: string;
  }) => Promise<{ success: boolean; error?: string; code?: string }>;
  // Google flow
  signInWithGoogle: (idToken: string) => Promise<{ success: boolean; isNew?: boolean; googleData?: GoogleSignInData; error?: string }>;
  // Password flow
  signInWithPassword: (login: string, password: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (phone: string, phoneToken: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  // Register (بعد OTP أو Google)
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string; code?: string }>;
  // Session
  signOut:        () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

export interface RegisterData {
  phone:        string;
  phone_token:  string;
  displayName:  string;
  arabicName?:  string;
  username:     string;
  country:      string;
  password?:    string;
  // إذا عبر Google
  googleId?:    string;
  email?:       string;
  avatar?:      string;
}

const STORAGE_KEYS = {
  ACCESS_TOKEN:  'safat_access_token',
  REFRESH_TOKEN: 'safat_refresh_token',
  USER:          'safat_user',
  LAST_AUTH_OK:  'safat_last_auth_ok',
} as const;

/** Proactive refresh — keeps long-lived session alive while app is installed. */
const SESSION_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
/**
 * Returning from ImagePicker briefly backgrounds the app and would otherwise
 * trigger a refresh that races authFetch — backend refresh-token reuse then
 * wipes all sessions and the user appears logged out.
 */
const FOREGROUND_REFRESH_MIN_GAP_MS = 45_000;

// ── Context ───────────────────────────────────────────────────────────────────
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [lastAuthOkAt, setLastAuthOkAt] = useState<number | null>(null);
  const [isLoading, setIsLoading]     = useState(true);
  const [activeMode, setActiveMode]   = useState<'USER' | 'BUTCHER'>('USER');
  const accessTokenRef = useRef<string | null>(null);
  accessTokenRef.current = accessToken;
  /** Single-flight lock — concurrent callers await the same refresh promise. */
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);
  const lastRefreshAtRef = useRef(0);

  const clearSession = useCallback(async () => {
    await AsyncStorage.multiRemove([...Object.values(STORAGE_KEYS), 'safat_active_mode']);
    setUser(null);
    setAccessToken(null);
    setLastAuthOkAt(null);
    setActiveMode('USER');
  }, []);

  const markAuthOk = useCallback(async () => {
    const ts = Date.now();
    setLastAuthOkAt(ts);
    lastRefreshAtRef.current = ts;
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_AUTH_OK, String(ts));
  }, []);

  const persistTokens = useCallback(async (access: string, refresh?: string) => {
    const pairs: [string, string][] = [[STORAGE_KEYS.ACCESS_TOKEN, access]];
    if (refresh) pairs.push([STORAGE_KEYS.REFRESH_TOKEN, refresh]);
    await AsyncStorage.multiSet(pairs);
    setAccessToken(access);
    await markAuthOk();
  }, [markAuthOk]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const task = (async (): Promise<boolean> => {
      try {
        const refresh = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
        if (!refresh) {
          await clearSession();
          return false;
        }

        const res = await fetchWithTimeout(`${API_BASE}/api/auth/refresh`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ refresh_token: refresh, refreshToken: refresh }),
        }, 12_000);

        const responseJson = await res.json().catch(() => ({}));
        const outcome = evaluateRefreshResult({
          status: res.status,
          body: responseJson,
        });
        if (outcome.kind === 'definitive_failure') {
          await clearSession();
          return false;
        }
        if (outcome.kind === 'transient_failure') {
          return false;
        }

        await persistTokens(outcome.accessToken, outcome.refreshToken);
        return true;
      } catch {
        // Network / timeout — keep stored credentials (transient).
        return false;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = task;
    return task;
  }, [clearSession, persistTokens]);

  const refreshSessionRef = useRef(refreshSession);
  refreshSessionRef.current = refreshSession;

  useEffect(() => {
    registerAuthFetch({
      getToken: () => accessTokenRef.current,
      refresh: () => refreshSessionRef.current(),
    });
  }, []);

  // ── Restore session ────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      let restoredAccess: string | null = null;
      try {
        const [storedToken, storedUser, storedMode, storedRefresh, storedAuthOk] =
          await AsyncStorage.multiGet([
          STORAGE_KEYS.ACCESS_TOKEN,
          STORAGE_KEYS.USER,
          'safat_active_mode',
          STORAGE_KEYS.REFRESH_TOKEN,
          STORAGE_KEYS.LAST_AUTH_OK,
        ]);
        const token    = storedToken[1];
        const userJson = storedUser[1];
        const mode     = storedMode[1];
        const refresh  = storedRefresh[1];
        const persisted = evaluatePersistedTokens({
          accessToken: token,
          refreshToken: refresh,
        });
        if (persisted === 'missing_refresh') {
          await clearSession();
        } else if (token && userJson) {
          restoredAccess = token;
          setAccessToken(token);
          const storedUserData = JSON.parse(userJson) as Record<string, unknown>;
          const parsedUser = normalizeAuthUser(storedUserData) as unknown as AuthUser;
          setUser(parsedUser);
          const parsedOk = storedAuthOk[1] ? Number(storedAuthOk[1]) : Date.now();
          setLastAuthOkAt(Number.isFinite(parsedOk) ? parsedOk : Date.now());
          setActiveMode(parseActiveMode(mode));
        }
      } catch {
        // Storage read failed — start fresh
      } finally {
        setIsLoading(false);
      }
      // Cached session is enough for first paint; rotate tokens after splash.
      if (restoredAccess) {
        void refreshSessionRef.current();
      }
    })();
  }, []);

  // ── Keep session alive: refresh when app returns to foreground ─────────────
  useEffect(() => {
    const onAppStateChange = (next: AppStateStatus) => {
      if (next !== 'active') return;
      // ImagePicker / system sheets bounce AppState — don't rotate tokens every time.
      if (Date.now() - lastRefreshAtRef.current < FOREGROUND_REFRESH_MIN_GAP_MS) return;
      void refreshSessionRef.current();
    };
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, []);

  // ── Periodic refresh while logged in (extends server session sliding window)
  useEffect(() => {
    if (!accessToken) return;
    const timer = setInterval(() => {
      void refreshSessionRef.current();
    }, SESSION_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [accessToken]);

  // ── Helper: حفظ الجلسة ────────────────────────────────────────────────────
  const saveSession = useCallback(async (userData: AuthUser, access: string, refresh: string) => {
    const normalized = normalizeAuthUser({ ...userData }) as unknown as AuthUser;
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.ACCESS_TOKEN,  access],
      [STORAGE_KEYS.REFRESH_TOKEN, refresh],
      [STORAGE_KEYS.USER,          JSON.stringify(normalized)],
    ]);
    setAccessToken(access);
    setUser(normalized);
    await markAuthOk();
  }, [markAuthOk]);

  // ── تبديل الوضع ────────────────────────────────────────────────────────────
  const switchMode = useCallback(async (mode: 'USER' | 'BUTCHER') => {
    setActiveMode(mode);
    await AsyncStorage.setItem('safat_active_mode', mode);
  }, []);

  // ── إرسال OTP ─────────────────────────────────────────────────────────────
  const sendOtp = useCallback(async (
    phone: string,
    channel: 'sms' | 'whatsapp' = 'sms',
    purpose: 'login' | 'signup' | 'join' | 'reset_password' = 'login',
  ) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, channel, purpose }),
      });
      const responseJson = await res.json().catch(() => ({}));
      const data = (responseJson && responseJson.success && responseJson.data !== undefined) ? responseJson.data : responseJson;
      
      if (!res.ok) {
        return {
          success: false,
          error: responseJson.messageAr ?? responseJson.message_ar ?? 'فشل إرسال الرمز',
          code: responseJson.error as string | undefined,
        };
      }
      return { success: true, devMode: data.dev_mode ?? false };
    } catch {
      return { success: false, error: 'تعذّر الاتصال بالخادم' };
    }
  }, []);

  // ── التحقق من OTP ─────────────────────────────────────────────────────────
  const verifyOtp = useCallback(async (
    phone: string,
    code: string,
    purpose: 'login' | 'reset_password' | 'signup' | 'join' = 'login',
  ) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, purpose }),
      });
      const responseJson = await res.json().catch(() => ({}));
      const data = (responseJson && responseJson.success && responseJson.data !== undefined) ? responseJson.data : responseJson;

      if (!res.ok) {
        return {
          success: false,
          error: responseJson.messageAr ?? responseJson.message_ar ?? 'الرمز غير صحيح',
          code: responseJson.error as string | undefined,
        };
      }

      // Signup / join / reset: return phone_token only — never create a session here.
      if (
        purpose === 'signup' ||
        purpose === 'join' ||
        purpose === 'reset_password' ||
        data.is_new_user
      ) {
        return {
          success: true,
          isNew: data.is_new_user ?? purpose === 'signup',
          phone,
          phoneToken: data.phone_token,
        };
      }

      // مستخدم موجود — احفظ الجلسة (login OTP فقط)
      await saveSession(data.user, data.access_token ?? data.accessToken, data.refresh_token ?? data.refreshToken);
      return { success: true, isNew: false };
    } catch {
      return { success: false, error: 'تعذّر الاتصال بالخادم' };
    }
  }, [saveSession]);

  // ── تحقق مبكّر لتفرّد التسجيل ──────────────────────────────────────────────
  const checkSignup = useCallback(async (fields: { phone?: string; username?: string }) => {
    try {
      const body: Record<string, string> = {};
      if (fields.phone) body.phone = fields.phone;
      if (fields.username) body.username = fields.username;
      const res = await fetch(`${API_BASE}/api/auth/check-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const responseJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          error: responseJson.messageAr ?? responseJson.message_ar ?? 'تعذّر التحقق',
          code: responseJson.error as string | undefined,
        };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'تعذّر الاتصال بالخادم' };
    }
  }, []);

  // ── Google Sign In ─────────────────────────────────────────────────────────
  const signInWithGoogle = useCallback(async (idToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });
      const responseJson = await res.json().catch(() => ({}));
      const data = (responseJson && responseJson.success && responseJson.data !== undefined) ? responseJson.data : responseJson;

      if (!res.ok) {
        return { success: false, error: responseJson.messageAr ?? responseJson.message_ar ?? 'فشل الدخول بـ Google' };
      }

      if (data.is_new_user) {
        return {
          success:    true,
          isNew:      true,
          googleData: {
            googleId:    data.google_id,
            email:       data.email,
            displayName: data.display_name,
            avatar:      data.avatar,
          },
        };
      }

      await saveSession(data.user, data.access_token ?? data.accessToken, data.refresh_token ?? data.refreshToken);
      return { success: true, isNew: false };
    } catch {
      return { success: false, error: 'تعذّر الاتصال بالخادم' };
    }
  }, [saveSession]);

  // ── تسجيل الدخول بكلمة المرور ──────────────────────────────────────────────
  const signInWithPassword = useCallback(async (login: string, password: string) => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      const responseJson = await res.json().catch(() => ({}));
      const data = (responseJson && responseJson.success && responseJson.data !== undefined) ? responseJson.data : responseJson;

      if (!res.ok) {
        return { success: false, error: responseJson.messageAr ?? responseJson.message_ar ?? 'بيانات الدخول غير صحيحة' };
      }

      const access = data.accessToken ?? data.access_token;
      const refresh = data.refreshToken ?? data.refresh_token;

      await saveSession(data.user, access, refresh);
      return { success: true };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          success: false,
          error: __DEV__
            ? `انتهت مهلة الاتصال بالخادم (${API_BASE}). تأكدي أن الباك إند شغال (npm run dev:all) وعلى USB استخدمي npm run android:usb`
            : 'انتهت مهلة الاتصال بالخادم',
        };
      }
      return {
        success: false,
        error: __DEV__
          ? `تعذّر الاتصال بالخادم (${API_BASE})`
          : 'تعذّر الاتصال بالخادم',
      };
    }
  }, [saveSession]);

  const resetPassword = useCallback(async (phone: string, phoneToken: string, newPassword: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, phone_token: phoneToken, newPassword }),
      });
      const responseJson = await res.json().catch(() => ({}));
      const data = (responseJson && responseJson.success && responseJson.data !== undefined) ? responseJson.data : responseJson;

      if (!res.ok) {
        return { success: false, error: responseJson.messageAr ?? responseJson.message_ar ?? 'فشل إعادة تعيين كلمة المرور' };
      }

      return { success: true };
    } catch {
      return { success: false, error: 'تعذّر الاتصال بالخادم' };
    }
  }, []);

  // ── تسجيل مستخدم جديد ────────────────────────────────────────────────────
  const register = useCallback(async (regData: RegisterData) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regData),
      });
      const responseJson = await res.json().catch(() => ({}));
      const data = (responseJson && responseJson.success && responseJson.data !== undefined) ? responseJson.data : responseJson;

      if (!res.ok) {
        return {
          success: false,
          error: responseJson.messageAr ?? responseJson.message_ar ?? 'فشل إنشاء الحساب',
          code: responseJson.error as string | undefined,
        };
      }

      await saveSession(data.user, data.access_token ?? data.accessToken, data.refresh_token ?? data.refreshToken);
      return { success: true };
    } catch {
      return { success: false, error: 'تعذّر الاتصال بالخادم' };
    }
  }, [saveSession]);

  // ── تسجيل الخروج ──────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    try {
      const refresh = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (user?.id && accessToken) {
        await clearPushTokenOnLogout(user.id, accessToken);
      }
      if (refresh && accessToken) {
        fetch(`${API_BASE}/api/auth/logout`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ refresh_token: refresh, refreshToken: refresh }),
        }).catch(() => {});
      }
    } finally {
      await clearSession();
    }
  }, [accessToken, clearSession, user?.id]);

  const authValue = useMemo(
    () => ({
      user,
      accessToken,
      isLoading,
      isAuthenticated:
        !!user && !!accessToken && isSessionStillTrusted(lastAuthOkAt),
      activeMode,
      switchMode,
      sendOtp,
      verifyOtp,
      checkSignup,
      signInWithGoogle,
      signInWithPassword,
      resetPassword,
      register,
      signOut,
      refreshSession,
    }),
    [
      user,
      accessToken,
      isLoading,
      lastAuthOkAt,
      activeMode,
      switchMode,
      sendOtp,
      verifyOtp,
      checkSignup,
      signInWithGoogle,
      signInWithPassword,
      resetPassword,
      register,
      signOut,
      refreshSession,
    ],
  );

  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
}
