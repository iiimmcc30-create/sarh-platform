import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { signButcherAccessToken } from '@/lib/butcher-jwt';

function request(path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(new URL(path, 'http://localhost:3003'), { headers });
}

describe('butcher dashboard middleware', () => {
  const secret = 'test-butcher-jwt-secret-minimum-32-chars!!';

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
    delete process.env.NEXT_PUBLIC_BUTCHER_BASE_PATH;
  });

  it('redirects protected pages to /login when cookie missing', async () => {
    const res = await middleware(request('/dashboard'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3003/login');
  });

  it('allows /login without token', async () => {
    const res = await middleware(request('/login'));
    expect(res.status).toBe(200);
  });

  it('redirects when cookie is not a valid JWT', async () => {
    const res = await middleware(
      request('/dashboard/orders', 'butcher_token=abc123'),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('redirects expired butcher tokens', async () => {
    const token = await signButcherAccessToken({
      secret,
      role: 'BUTCHER',
      expiresInSec: -10,
    });
    const res = await middleware(
      request('/dashboard', `butcher_token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(307);
  });

  it('allows dashboard when butcher_token is a valid BUTCHER JWT', async () => {
    const token = await signButcherAccessToken({ secret, role: 'BUTCHER' });
    const res = await middleware(
      request('/dashboard/orders', `butcher_token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(200);
  });

  it('decodes URI-encoded cookie tokens and verifies the signature', async () => {
    const token = await signButcherAccessToken({ secret, role: 'BUTCHER' });
    const res = await middleware(
      request('/dashboard', `butcher_token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(200);
  });

  it('denies a valid JWT with a non-butcher role', async () => {
    const token = await signButcherAccessToken({ secret, role: 'USER' });
    const res = await middleware(
      request('/dashboard', `butcher_token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(307);
  });

  it('denies ADMIN role even with a valid signature', async () => {
    const token = await signButcherAccessToken({ secret, role: 'ADMIN' });
    const res = await middleware(
      request('/dashboard', `butcher_token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(307);
  });

  it('redirects when JWT_SECRET is not configured', async () => {
    delete process.env.JWT_SECRET;
    const token = await signButcherAccessToken({ secret, role: 'BUTCHER' });
    const res = await middleware(
      request('/dashboard', `butcher_token=${encodeURIComponent(token)}`),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });
});
