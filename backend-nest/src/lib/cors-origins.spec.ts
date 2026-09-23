import { isAllowedCorsOrigin, resolveCorsOrigins } from './cors-origins';

describe('cors origins', () => {
  const keys = [
    'ALLOWED_ORIGINS',
    'NODE_ENV',
    'FRONTEND_URL',
    'BUTCHER_DASHBOARD_URL',
    'BUTCHER_DASHBOARD_ALLOW_VERCEL',
    'BUTCHER_DASHBOARD_VERCEL_HOSTS',
  ] as const;
  let snapshot: Record<string, string | undefined>;

  beforeEach(() => {
    snapshot = {};
    for (const key of keys) snapshot[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of keys) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  });

  it('never treats unknown origins as allowed (credentials require exact origin)', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://sarhsa.online';
    expect(isAllowedCorsOrigin('https://evil.example')).toBe(false);
    expect(isAllowedCorsOrigin('https://sarhsa.online')).toBe(true);
  });

  it('strips railway and localhost from production CORS origins', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS =
      'http://localhost:8081,https://sarh-app.up.railway.app,https://sarhsa.online';
    const origins = resolveCorsOrigins();
    expect(origins).toContain('https://sarhsa.online');
    expect(origins).toContain('https://www.sarhsa.online');
    expect(origins.some((origin) => origin.includes('railway'))).toBe(false);
    expect(origins.some((origin) => origin.includes('localhost'))).toBe(false);
    expect(isAllowedCorsOrigin('https://sarhsa.online')).toBe(true);
    expect(isAllowedCorsOrigin('https://evil.example')).toBe(false);
    expect(isAllowedCorsOrigin(undefined)).toBe(true);
  });

  it('allows butcher dashboard origin from BUTCHER_DASHBOARD_URL in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = '';
    process.env.FRONTEND_URL = '';
    process.env.BUTCHER_DASHBOARD_URL = 'https://butchers.sarh.app';
    const origins = resolveCorsOrigins();
    expect(origins).toContain('https://butchers.sarh.app');
    expect(isAllowedCorsOrigin('https://butchers.sarh.app')).toBe(true);
  });

  it('allows local butcher dashboard origin outside production', () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOWED_ORIGINS = '';
    process.env.FRONTEND_URL = '';
    process.env.BUTCHER_DASHBOARD_URL = '';
    const origins = resolveCorsOrigins();
    expect(origins).toContain('http://localhost:3002');
    expect(origins).toContain('http://127.0.0.1:3002');
    expect(origins).toContain('http://localhost:3003');
    expect(isAllowedCorsOrigin('http://localhost:3003')).toBe(true);
  });

  it('ignores localhost FRONTEND_URL in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = '';
    process.env.FRONTEND_URL = 'http://localhost:8081';
    const origins = resolveCorsOrigins();
    expect(origins.some((origin) => origin.includes('localhost'))).toBe(false);
    expect(origins).toContain('https://sarhsa.online');
  });

  it('allows a listed Vercel default hostname in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = '';
    process.env.FRONTEND_URL = '';
    process.env.BUTCHER_DASHBOARD_URL = '';
    process.env.BUTCHER_DASHBOARD_ALLOW_VERCEL = '';
    process.env.BUTCHER_DASHBOARD_VERCEL_HOSTS =
      'sarh-butcher-dashboard.vercel.app';
    expect(
      isAllowedCorsOrigin('https://sarh-butcher-dashboard.vercel.app'),
    ).toBe(true);
    expect(isAllowedCorsOrigin('https://random-app.vercel.app')).toBe(false);
  });

  it('ignores BUTCHER_DASHBOARD_ALLOW_VERCEL in production (explicit hosts still work)', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = '';
    process.env.FRONTEND_URL = '';
    process.env.BUTCHER_DASHBOARD_URL = '';
    process.env.BUTCHER_DASHBOARD_VERCEL_HOSTS = '';
    process.env.BUTCHER_DASHBOARD_ALLOW_VERCEL = 'true';
    expect(isAllowedCorsOrigin('https://any-preview.vercel.app')).toBe(false);
    expect(isAllowedCorsOrigin('https://sarhsa.online')).toBe(true);
  });

  it('allows *.vercel.app in non-production when the preview flag is on', () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOWED_ORIGINS = '';
    process.env.FRONTEND_URL = '';
    process.env.BUTCHER_DASHBOARD_URL = '';
    process.env.BUTCHER_DASHBOARD_VERCEL_HOSTS = '';
    process.env.BUTCHER_DASHBOARD_ALLOW_VERCEL = 'true';
    expect(isAllowedCorsOrigin('https://any-preview.vercel.app')).toBe(true);
    expect(isAllowedCorsOrigin('https://evil.example')).toBe(false);
  });

  it('denies preview Vercel origins in non-production when the flag is off', () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOWED_ORIGINS = '';
    process.env.FRONTEND_URL = '';
    process.env.BUTCHER_DASHBOARD_URL = '';
    process.env.BUTCHER_DASHBOARD_VERCEL_HOSTS = '';
    process.env.BUTCHER_DASHBOARD_ALLOW_VERCEL = 'false';
    expect(isAllowedCorsOrigin('https://any-preview.vercel.app')).toBe(false);
  });
});
