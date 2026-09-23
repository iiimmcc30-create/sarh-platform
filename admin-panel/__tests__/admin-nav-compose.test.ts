import { readFileSync } from 'fs';
import { join } from 'path';

describe('admin production compose auth wiring', () => {
  const compose = readFileSync(
    join(__dirname, '../../docker-compose.prod.yml'),
    'utf8',
  );

  const adminBlock = (() => {
    const start = compose.indexOf('\n  admin:');
    expect(start).toBeGreaterThanOrEqual(0);
    const next = compose.indexOf('\n  butcher:', start + 1);
    return next > start ? compose.slice(start, next) : compose.slice(start);
  })();

  it('passes JWT_SECRET into the admin service (middleware cookie verify)', () => {
    expect(adminBlock).toMatch(/JWT_SECRET:\s*\$\{JWT_SECRET/);
    expect(adminBlock).toContain('NEXT_PUBLIC_ADMIN_BASE_PATH: /admin');
  });

  it('does not leave admin with only PORT/HOSTNAME (regression: nav bounce to /admin)', () => {
    // Missing JWT_SECRET caused: /admin/users → /admin/login → restore → /admin
    expect(adminBlock).toContain('JWT_SECRET');
    expect(adminBlock).not.toMatch(
      /environment:\s*\n\s*NODE_ENV: production\s*\n\s*PORT: '3000'\s*\n\s*HOSTNAME: 0\.0\.0\.0\s*\n\s*depends_on:/,
    );
  });
});

describe('admin sidebar routes stay under /admin basePath', () => {
  const sidebar = readFileSync(
    join(__dirname, '../src/components/layout/Sidebar.tsx'),
    'utf8',
  );
  const nav = readFileSync(
    join(__dirname, '../src/constants/adminNav.ts'),
    'utf8',
  );
  const login = readFileSync(
    join(__dirname, '../src/app/login/page.tsx'),
    'utf8',
  );
  const middleware = readFileSync(
    join(__dirname, '../src/middleware.ts'),
    'utf8',
  );

  it('uses Next Link hrefs without double-prefixing basePath', () => {
    expect(sidebar).toContain('href={href}');
    expect(sidebar).not.toContain('href={withAdminBase(href)}');
    expect(nav).toContain("href: '/users'");
    expect(nav).toContain("href: '/listings'");
    expect(nav).toContain("href: '/orders'");
    expect(nav).toContain("href: '/payments'");
  });

  it('keeps auth redirects on /admin/login and home under basePath helpers', () => {
    expect(middleware).toContain('adminLoginPath()');
    expect(middleware).toContain(
      'NextResponse.redirect(new URL(adminLoginPath(), request.url))',
    );
    expect(login).toContain("withAdminBase('/')");
    expect(sidebar).toContain("withAdminBase('/login')");
  });
});
