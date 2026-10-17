import { readFileSync } from 'fs';
import { join } from 'path';
import { isAllowedCorsOrigin, resolveCorsOrigins } from './cors-origins';

describe('cors origins', () => {
  const keys = ['ALLOWED_ORIGINS', 'NODE_ENV', 'FRONTEND_URL'] as const;
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
    expect(origins).toContain('https://getsarh.com');
    expect(origins).toContain('https://www.getsarh.com');
    expect(origins.some((origin) => origin.includes('railway'))).toBe(false);
    expect(origins.some((origin) => origin.includes('localhost'))).toBe(false);
    expect(isAllowedCorsOrigin('https://sarhsa.online')).toBe(true);
    expect(isAllowedCorsOrigin('https://evil.example')).toBe(false);
    expect(isAllowedCorsOrigin(undefined)).toBe(true);
  });

  it('allows local admin origin outside production', () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOWED_ORIGINS = '';
    process.env.FRONTEND_URL = '';
    const origins = resolveCorsOrigins();
    expect(origins).toContain('http://localhost:3002');
    expect(origins).toContain('http://127.0.0.1:3002');
    expect(isAllowedCorsOrigin('http://localhost:3003')).toBe(false);
  });

  it('ignores localhost FRONTEND_URL in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = '';
    process.env.FRONTEND_URL = 'http://localhost:8081';
    const origins = resolveCorsOrigins();
    expect(origins.some((origin) => origin.includes('localhost'))).toBe(false);
    expect(origins).toContain('https://sarhsa.online');
  });

  it('never allows Vercel preview origins', () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOWED_ORIGINS = '';
    process.env.FRONTEND_URL = '';
    expect(isAllowedCorsOrigin('https://any-preview.vercel.app')).toBe(false);
  });
});

describe('HTTP fingerprinting', () => {
  it('disables Express X-Powered-By on the API and socket processes', () => {
    expect(readFileSync(join(__dirname, '../main.ts'), 'utf8')).toContain(
      "disable('x-powered-by')",
    );
    expect(
      readFileSync(join(__dirname, '../gateway/socket.main.ts'), 'utf8'),
    ).toContain("disable('x-powered-by')");
  });
});
