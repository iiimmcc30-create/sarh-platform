import { Platform } from 'react-native';
import Constants from 'expo-constants';

const PRODUCTION_API = 'https://sarhsa.online';
const PRODUCTION_SOCKET = 'https://sarhsa.online';
/** @deprecated Railway is decommissioned; kept as alias for imports. */
const RAILWAY_API = PRODUCTION_API;

function getExpoDevHost(): string | null {
  if (!__DEV__) return null;

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    return hostUri.replace(/^exp:\/\//, '').split(':')[0] ?? null;
  }

  const debuggerHost =
    (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost
    ?? (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;

  return debuggerHost?.split(':')[0] ?? null;
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1';
}

export function resolveDevServiceUrl(envUrl: string | undefined, port: number): string {
  const fromEnv = envUrl?.replace(/\/$/, '');

  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    return fromEnv;
  }

  // Store / production builds must never wait on localhost.
  if (!__DEV__) {
    return port === 3002 ? PRODUCTION_SOCKET : PRODUCTION_API;
  }

  // Honor explicit URL from start scripts (LAN / USB / local mock).
  if (fromEnv) {
    return fromEnv;
  }

  const expoHost = getExpoDevHost();

  if (__DEV__ && Constants.isDevice && expoHost && !isLoopbackHost(expoHost)) {
    return `http://${expoHost}:${port}`;
  }

  if (__DEV__ && Constants.isDevice && expoHost && isLoopbackHost(expoHost)) {
    return `http://127.0.0.1:${port}`;
  }

  if (__DEV__ && Constants.isDevice) {
    return PRODUCTION_API;
  }

  if (Platform.OS === 'android' && !Constants.isDevice) {
    return `http://10.0.2.2:${port}`;
  }

  return `http://localhost:${port}`;
}

export { PRODUCTION_API, PRODUCTION_SOCKET, RAILWAY_API };
