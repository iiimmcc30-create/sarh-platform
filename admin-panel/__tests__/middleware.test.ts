import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { signAdminAccessToken } from '@/lib/admin-jwt';

function request(path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(new URL(path, 'http://localhost:3000'), { headers });
}

describe('admin middleware auth gate', () => {
  const secret = 'test-admin-jwt-secret-minimum-32-chars!!';

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
    delete process.env.NEXT_PUBLIC_ADMIN_BASE_PATH;
  });

  it('redirects protected pages to /login when cookie missing (local, no basePath)', async () => {
    const res = await middleware(request('/users'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login');
  });

  it('allows /login without token so client can restore or clear session', async () => {
    const res = await middleware(request('/login'));
    expect(res.status).toBe(200);
  });

  it('redirects when cookie is not a valid JWT', async () => {
    const res = await middleware(request('/listings', 'admin_token=abc123'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('redirects expired staff tokens', async () => {
    const token = await signAdminAccessToken({
      secret,
      role: 'ADMIN',
      expiresInSec: -10,
    });
    const res = await middleware(
      request('/orders', `admin_token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(307);
  });

  it('allows a valid ADMIN token', async () => {
    const token = await signAdminAccessToken({ secret, role: 'ADMIN' });
    const res = await middleware(
      request('/listings', `admin_token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(200);
  });

  it('allows a valid MODERATOR token', async () => {
    const token = await signAdminAccessToken({ secret, role: 'MODERATOR' });
    const res = await middleware(
      request('/users', `admin_token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(200);
  });

  it('denies a valid JWT with a non-staff role', async () => {
    const token = await signAdminAccessToken({ secret, role: 'USER' });
    const res = await middleware(
      request('/users', `admin_token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(307);
  });

  it('protects nested support and plan routes', async () => {
    const missing = await middleware(request('/support/tickets/1'));
    expect(missing.headers.get('location')).toContain('/login');
    const missingPlans = await middleware(request('/plans/p1'));
    expect(missingPlans.headers.get('location')).toContain('/login');
  });

  it('redirects when JWT_SECRET is not configured', async () => {
    delete process.env.JWT_SECRET;
    const token = await signAdminAccessToken({ secret, role: 'ADMIN' });
    const res = await middleware(
      request('/users', `admin_token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(307);
    // Production bug without compose JWT_SECRET: every section hit login, then
    // login restored localStorage and sent the user back to `/` (home).
    expect(res.headers.get('location')).toContain('/login');
  });

  it('allows section routes with a valid cookie when JWT_SECRET is set', async () => {
    const token = await signAdminAccessToken({ secret, role: 'ADMIN' });
    for (const path of ['/users', '/listings', '/orders', '/payments']) {
      const res = await middleware(
        request(path, `admin_token=${encodeURIComponent(token)}`),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    }
  });
});

describe('admin middleware basePath login redirect', () => {
  const secret = 'test-admin-jwt-secret-minimum-32-chars!!';

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = secret;
    process.env.NEXT_PUBLIC_ADMIN_BASE_PATH = '/admin';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_ADMIN_BASE_PATH;
  });

  it('redirects unauthenticated users to /admin/login, never root /login', async () => {
    const { middleware: mw } = await import('@/middleware');
    const headers = new Headers();
    const req = new NextRequest(
      new URL('/users', 'https://sarhsa.online/admin/users'),
      { headers },
    );
    // Simulate production request URL as seen behind nginx path prefix.
    const prodReq = new NextRequest('https://sarhsa.online/admin/users', {
      headers,
    });
    const res = await mw(prodReq);
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toBe('https://sarhsa.online/admin/login');
    expect(location).not.toMatch(/https:\/\/sarhsa\.online\/login$/);
    expect(new URL(location).pathname).toBe('/admin/login');
    void req;
  });

  it('adminLoginPath helper never returns root /login under basePath', async () => {
    const { adminLoginPath, withAdminBase } = await import(
      '@/constants/adminBasePath'
    );
    expect(adminLoginPath()).toBe('/admin/login');
    expect(withAdminBase('/login')).toBe('/admin/login');
    expect(adminLoginPath()).not.toBe('/login');
  });
});
