import { Platform } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { PRODUCTION_SOCKET, resolveDevServiceUrl } from '@/services/devHost';

function usesSameOriginWebSocket(): boolean {
  if (Platform.OS !== 'web') return false;
  if (process.env.EXPO_PUBLIC_WEB_SAME_ORIGIN === 'true') return true;
  return !__DEV__;
}

function resolveSocketUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SOCKET_URL?.trim().replace(/\/$/, '');
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    return fromEnv;
  }
  if (usesSameOriginWebSocket()) {
    return '';
  }
  if (!__DEV__) {
    return PRODUCTION_SOCKET;
  }
  return resolveDevServiceUrl(process.env.EXPO_PUBLIC_SOCKET_URL, 3002);
}

export function connectSocket(accessToken: string): Socket {
  return io(resolveSocketUrl(), {
    auth: { token: accessToken },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });
}

export { resolveSocketUrl };
