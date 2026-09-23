import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { resolveDevServiceUrl, PRODUCTION_API } from './devHost';

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

let reachabilityChecked = false;

async function probeApiHealth(baseUrl: string, timeoutMs = 800): Promise<boolean> {
  if (!baseUrl) return true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** Skip health probes when already on the live API — they were blocking first paint. */
export async function ensureApiReachable(): Promise<string> {
  if (!API_BASE || usesSameOriginWebApi()) {
    return API_BASE;
  }
  if (!__DEV__ || API_BASE.includes('onrender.com') || /^https:\/\//i.test(API_BASE)) {
    return API_BASE;
  }
  if (reachabilityChecked) {
    return API_BASE;
  }
  reachabilityChecked = true;

  if (await probeApiHealth(API_BASE)) {
    return API_BASE;
  }

  if (!API_BASE.includes('onrender.com') && (await probeApiHealth(PRODUCTION_API))) {
    console.warn('[سرح] Local API unreachable — switched to production (Render)');
    API_BASE = PRODUCTION_API;
  }

  return API_BASE;
}

if (__DEV__) {
  console.log('[سرح] API_BASE =', API_BASE);
  console.log('[سرح] Metro host =', Constants.expoConfig?.hostUri ?? 'n/a');
  if (API_BASE.includes('127.0.0.1')) {
    console.log('[سرح] USB — إذا فشل الاتصال: npm run adb:reverse (أو أعدي تشغيل Metro)');
  }
  if (API_BASE.includes('onrender.com')) {
    console.log('[سرح] API → Render (بيانات الإنتاج)');
    // Wake Render from cold start in the background — free tier sleeps after 15min inactivity.
    void probeApiHealth(API_BASE, 90_000).then((ok) => {
      if (ok) console.log('[سرح] Render ready ✓');
      else console.warn('[سرح] Render health probe failed — requests may be slow');
    });
  }
}

export { PRODUCTION_API };
