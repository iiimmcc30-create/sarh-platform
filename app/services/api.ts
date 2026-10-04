import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { resolveDevServiceUrl, PRODUCTION_API } from './devHost';
import {
  apiFallbackMessage,
  resolveReachableApiBase,
  setApiRebase,
  setPendingApiProbe,
  shouldProbeLocalApi,
} from './apiFallback';

function usesSameOriginWebApi(): boolean {
  if (Platform.OS !== 'web') return false;
  if (process.env.EXPO_PUBLIC_WEB_SAME_ORIGIN === 'true') return true;
  return !__DEV__;
}

function resolveApiBase(): string {
  if (usesSameOriginWebApi()) {
    return '';
  }
  return resolveDevServiceUrl(process.env.EXPO_PUBLIC_API_URL, 3001);
}

export let API_BASE = resolveApiBase();

async function probeApiHealth(baseUrl: string, timeoutMs: number): Promise<boolean> {
  if (!baseUrl) return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/health`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let reachability: Promise<string> | null = null;

/**
 * Production / https bases return immediately (no probe). A dev build on a local http
 * backend probes it once (short timeout) and otherwise switches straight to Hostinger.
 */
export function ensureApiReachable(): Promise<string> {
  if (usesSameOriginWebApi() || !shouldProbeLocalApi(API_BASE, __DEV__)) {
    return Promise.resolve(API_BASE);
  }
  if (reachability) return reachability;

  const localBase = API_BASE;
  reachability = resolveReachableApiBase(localBase, __DEV__, probeApiHealth, PRODUCTION_API).then(
    ({ base, switched }) => {
      if (switched) {
        console.warn(apiFallbackMessage(PRODUCTION_API));
        API_BASE = base;
        setApiRebase(localBase, base);
      }
      return API_BASE;
    },
  );
  setPendingApiProbe(localBase, reachability);
  return reachability;
}

if (__DEV__) {
  console.log('[سرح] API_BASE =', API_BASE);
  console.log('[سرح] Metro host =', Constants.expoConfig?.hostUri ?? 'n/a');
  if (API_BASE.includes('127.0.0.1')) {
    console.log('[سرح] USB — إذا فشل الاتصال: npm run adb:reverse (أو أعدي تشغيل Metro)');
  }
  // Probe the local backend once at startup so early requests are rebased quickly.
  void ensureApiReachable();
}

export { PRODUCTION_API };
