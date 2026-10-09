import jwt from 'jsonwebtoken';
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  buildAdminSessionCookies,
  buildClearAdminSessionCookies,
  hasAdminCsrfHeader,
  parseCookieHeader,
  readCookie,
  secondsUntilJwtExpiry,
  shouldUseSecureCookie,
} from './admin-session-cookie';

describe('admin session cookies', () => {
  const access = jwt.sign({ userId: 'u1', role: 'ADMIN' }, 's', {
    expiresIn: 900,
  });

  it('sets HttpOnly, SameSite=Strict, Secure cookies with scoped refresh path', () => {
    const [a, r] = buildAdminSessionCookies(
      { accessToken: access, refreshToken: 'ref' },
      true,
    );
    expect(a.startsWith(`${ADMIN_ACCESS_COOKIE}=`)).toBe(true);
    expect(a).toContain('Path=/;');
    expect(a).toMatch(/HttpOnly/);
    expect(a).toMatch(/SameSite=Strict/);
    expect(a).toMatch(/Secure$/);
    const maxAge = Number(/Max-Age=(\d+)/.exec(a)?.[1]);
    expect(maxAge).toBeGreaterThan(890);
    expect(maxAge).toBeLessThanOrEqual(900);
    expect(r.startsWith(`${ADMIN_REFRESH_COOKIE}=ref;`)).toBe(true);
    expect(r).toContain('Path=/api/admin/auth');
    expect(r).toMatch(/HttpOnly/);
  });

  it('omits Secure for local http and clears with Max-Age=0', () => {
    const cleared = buildClearAdminSessionCookies(false);
    expect(cleared[0]).toContain('Max-Age=0');
    expect(cleared[0]).not.toContain('Secure');
    expect(cleared[1]).toContain('Path=/api/admin/auth');
  });

  it('parses cookie headers', () => {
    expect(parseCookieHeader('a=1; admin_token=x%2By; b')).toEqual({
      a: '1',
      admin_token: 'x+y',
    });
    expect(readCookie(undefined, 'a')).toBeUndefined();
    expect(readCookie('admin_token=', 'admin_token')).toBeUndefined();
  });

  it('detects the panel CSRF header', () => {
    expect(hasAdminCsrfHeader({ 'x-requested-with': 'sarh-admin' })).toBe(true);
    expect(hasAdminCsrfHeader({ 'x-requested-with': 'XMLHttpRequest' })).toBe(
      false,
    );
    expect(hasAdminCsrfHeader({})).toBe(false);
  });

  it('computes JWT expiry and secure flag', () => {
    expect(secondsUntilJwtExpiry('garbage')).toBe(0);
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    expect(shouldUseSecureCookie({ headers: {} })).toBe(false);
    expect(
      shouldUseSecureCookie({ headers: { 'x-forwarded-proto': 'https' } }),
    ).toBe(true);
    process.env.NODE_ENV = 'production';
    expect(shouldUseSecureCookie({ headers: {} })).toBe(true);
    process.env.NODE_ENV = prev;
  });
});
