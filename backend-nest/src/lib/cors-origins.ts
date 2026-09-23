const PRODUCTION_ORIGINS = [
  'https://sarhsa.online',
  'https://www.sarhsa.online',
];

const STALE_ORIGIN_MARKERS = ['railway.app'];

function parseOriginList(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function hostnameOf(origin: string): string | undefined {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/** Default Vercel hostname (`*.vercel.app`) — not a custom domain. */
export function isVercelAppOrigin(origin: string): boolean {
  const hostname = hostnameOf(origin);
  if (!hostname) return false;
  if (hostname === 'vercel.app') return false;
  return hostname.endsWith('.vercel.app');
}

function isListedVercelHost(origin: string): boolean {
  const hostname = hostnameOf(origin);
  if (!hostname) return false;
  const hosts = parseOriginList(process.env.BUTCHER_DASHBOARD_VERCEL_HOSTS).map(
    (value) => value.replace(/^https?:\/\//, '').toLowerCase(),
  );
  return hosts.includes(hostname);
}

function isLocalOrigin(origin: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(origin);
}

function isStaleOrigin(origin: string): boolean {
  return STALE_ORIGIN_MARKERS.some((marker) => origin.includes(marker));
}

/** Allowed browser origins. Native clients send no Origin and are unaffected. */
export function resolveCorsOrigins(): string[] {
  const fromEnv = parseOriginList(process.env.ALLOWED_ORIGINS);
  const frontend = (process.env.FRONTEND_URL || '').replace(/\/$/, '').trim();
  if (frontend) fromEnv.push(frontend);
  const butcherDashboard = (process.env.BUTCHER_DASHBOARD_URL || '')
    .replace(/\/$/, '')
    .trim();
  if (butcherDashboard) fromEnv.push(butcherDashboard);
  for (const host of parseOriginList(
    process.env.BUTCHER_DASHBOARD_VERCEL_HOSTS,
  )) {
    fromEnv.push(host.startsWith('http') ? host : `https://${host}`);
  }

  const production = process.env.NODE_ENV === 'production';
  const origins = new Set<string>();

  for (const origin of fromEnv) {
    if (isStaleOrigin(origin)) continue;
    if (production && isLocalOrigin(origin)) continue;
    origins.add(origin);
  }

  if (production) {
    for (const origin of PRODUCTION_ORIGINS) origins.add(origin);
  } else if (origins.size === 0) {
    origins.add('http://localhost:8081');
  }

  if (!production) {
    origins.add('http://localhost:3002');
    origins.add('http://127.0.0.1:3002');
    origins.add('http://localhost:3003');
    origins.add('http://127.0.0.1:3003');
  }

  return [...origins];
}

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  if (resolveCorsOrigins().includes(normalized)) return true;
  if (isListedVercelHost(origin)) return true;
  // Wildcard *.vercel.app is preview/dev only — never in production.
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.BUTCHER_DASHBOARD_ALLOW_VERCEL === 'true'
  ) {
    return isVercelAppOrigin(origin);
  }
  return false;
}
