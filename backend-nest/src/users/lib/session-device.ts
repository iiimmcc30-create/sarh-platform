/**
 * Friendly device label for «الأجهزة المتصلة» from the stored user-agent
 * (`UserSession.deviceInfo`). Read-only display; never used for auth.
 */
export function describeSessionDevice(userAgent: string | null | undefined): {
  label: string;
  platform: 'ios' | 'android' | 'web' | 'unknown';
} {
  const ua = (userAgent ?? '').trim();
  if (!ua) return { label: 'جهاز غير معروف', platform: 'unknown' };
  const lower = ua.toLowerCase();
  if (/iphone|ipad|ios|darwin|cfnetwork/.test(lower)) {
    return { label: lower.includes('ipad') ? 'iPad' : 'iPhone', platform: 'ios' };
  }
  if (lower.includes('android') || lower.includes('okhttp')) {
    return { label: 'Android', platform: 'android' };
  }
  if (/mozilla|chrome|safari|firefox|edg\//.test(lower)) {
    const browser = lower.includes('edg/')
      ? 'Edge'
      : lower.includes('chrome')
        ? 'Chrome'
        : lower.includes('firefox')
          ? 'Firefox'
          : lower.includes('safari')
            ? 'Safari'
            : 'المتصفح';
    const os = lower.includes('windows')
      ? 'Windows'
      : lower.includes('mac os')
        ? 'macOS'
        : lower.includes('linux')
          ? 'Linux'
          : '';
    return { label: os ? `${browser} · ${os}` : browser, platform: 'web' };
  }
  return { label: 'جهاز غير معروف', platform: 'unknown' };
}

/** Coarse IP for display: IPv4 keeps the first two octets, IPv6 the first two groups. */
export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const clean = ip.replace(/^::ffff:/, '');
  if (clean.includes('.')) {
    const parts = clean.split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.*.*` : null;
  }
  if (clean.includes(':')) {
    const groups = clean.split(':').filter(Boolean);
    return groups.length >= 2 ? `${groups[0]}:${groups[1]}:…` : null;
  }
  return null;
}
