import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAdminAccessToken } from '@/lib/admin-jwt';
import { adminLoginPath } from '@/constants/adminBasePath';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rawToken = request.cookies.get('admin_token')?.value;
  const token = rawToken ? decodeURIComponent(rawToken) : undefined;
  // With next.config basePath, middleware pathname is unprefixed (e.g. `/login`).
  const isLogin = pathname === '/login' || pathname.startsWith('/login/');

  // Login page validates/restores sessions client-side; stale cookies must not
  // bounce users away before the page can clear or refresh them.
  if (isLogin) {
    return NextResponse.next();
  }

  const verified = await verifyAdminAccessToken(
    token,
    process.env.JWT_SECRET,
  );
  if (!verified.ok) {
    // Do not use `new URL('/login', request.url)` — that ignores basePath and
    // sends browsers to https://host/login (Expo unmatched), not /admin/login.
    return NextResponse.redirect(new URL(adminLoginPath(), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
