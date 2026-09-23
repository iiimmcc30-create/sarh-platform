import { API_BASE } from '@/services/api';

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function isPrivateLanHost(hostname: string): boolean {
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
  if (!m) return false;
  const second = Number(m[1]);
  return second >= 16 && second <= 31;
}

/** Normalize stored media URLs so they load on device (loopback/LAN → API_BASE, relative paths). */
export function resolveMediaUrl(url?: string | null): string | undefined {
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith('file://') || trimmed.startsWith('content://')) {
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    return `${API_BASE}${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (isLoopbackHost(parsed.hostname) || isPrivateLanHost(parsed.hostname)) {
      const api = new URL(API_BASE);
      // Keep path/query; swap host to the reachable API (dev proxy / tunnel / production).
      parsed.protocol = api.protocol;
      parsed.hostname = api.hostname;
      parsed.port = api.port;
      return parsed.toString();
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}
