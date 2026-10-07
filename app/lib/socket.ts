import { Platform } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { resolveSocketBase } from '@/services/apiFallback';
import { PRODUCTION_SOCKET, resolveDevServiceUrl } from '@/services/devHost';

function usesSameOriginWebSocket(): boolean {
  if (Platform.OS !== 'web') return false;
  if (process.env.EXPO_PUBLIC_WEB_SAME_ORIGIN === 'true') return true;
  return !__DEV__;
}

function resolveSocketUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SOCKET_URL?.trim().replace(/\/$/, '');
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    // Dev scripts pass a local http URL; follow the API if it fell back to production.
    return __DEV__ ? resolveSocketBase(fromEnv) : fromEnv;
  }
  if (usesSameOriginWebSocket()) {
    return '';
  }
  if (!__DEV__) {
    return PRODUCTION_SOCKET;
  }
  // Dev: follow the API's production fallback when the local backend is down.
  return resolveSocketBase(resolveDevServiceUrl(process.env.EXPO_PUBLIC_SOCKET_URL, 3002));
}

export function connectSocket(accessToken: string): Socket {
  return io(resolveSocketUrl(), {
    auth: { token: accessToken },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });
}

export { resolveSocketUrl };
