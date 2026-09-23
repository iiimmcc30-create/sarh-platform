import { ADMIN_FEATURE_ROUTES, ADMIN_NAV, isAdminNavActive } from '@/constants/adminNav';
import { OFFICIAL_SERVICE_CATEGORIES } from '@/services/official-services.service';
import { BRAND_NAME_AR, BRAND_NAME_EN } from '@/constants/brandCopy';
import { cleanListParams } from '@/services/admin.service';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const DASHBOARD_ROOT = path.join(__dirname, '../src/app/(dashboard)');
const LOGIN_PAGE = path.join(__dirname, '../src/app/login/page.tsx');

function routeToPageFile(route: string): string {
  if (route === '/login') return LOGIN_PAGE;
  if (route === '/') return path.join(DASHBOARD_ROOT, 'page.tsx');
  const relative = route
    .replace(/^\//, '')
    .split('/')
    .map((seg) => seg)
    .join('/');
  return path.join(DASHBOARD_ROOT, relative, 'page.tsx');
}

describe('admin navigation & feature routes inventory', () => {
  it('exposes every primary sidebar section', () => {
    expect(ADMIN_NAV.map((n) => n.href)).toEqual([
      '/',
      '/health',
      '/payments',
      '/commissions',
      '/users',
      '/posts',
      '/editorial-stories',
      '/knowledge',
      '/ministry',
      '/listings',
      '/categories',
      '/reports',
      '/support',
      '/live',
      '/butchers',
      '/butcher-banners',
      '/explore-sarh-banners',
      '/feed-suppliers',
      '/applications',
      '/orders',
      '/plans',
      '/content',
      '/home-explore',
      '/settings',
    ]);
  });

  it('marks nested paths active under their section', () => {
    expect(isAdminNavActive('/support/tickets/1', '/support')).toBe(true);
    expect(isAdminNavActive('/users', '/')).toBe(false);
    expect(isAdminNavActive('/', '/')).toBe(true);
    expect(isAdminNavActive('/listings', '/listings')).toBe(true);
  });

  it('has a page.tsx for every declared admin feature route', () => {
    const missing = ADMIN_FEATURE_ROUTES.filter((route) => !existsSync(routeToPageFile(route)));
    expect(missing).toEqual([]);
  });

  it('maps a sidebar icon for every primary nav href', () => {
    const sidebar = readFileSync(
      path.join(__dirname, '../src/components/layout/Sidebar.tsx'),
      'utf8',
    );
    const missing = ADMIN_NAV.filter((item) => !sidebar.includes(`'${item.href}':`));
    expect(missing.map((item) => item.href)).toEqual([]);
  });

  it('keeps brand identity constants', () => {
    expect(BRAND_NAME_AR).toBe('سرح');
    expect(BRAND_NAME_EN).toBe('Sarh');
  });

  it('defines official service categories used by admin CRUD', () => {
    expect(OFFICIAL_SERVICE_CATEGORIES.map((c) => c.value)).toEqual([
      'veterinary',
      'livestock',
      'slaughter',
    ]);
  });
});

describe('cleanListParams', () => {
  it('drops empty strings and invalid pagination', () => {
    expect(
      cleanListParams({
        page: 0,
        pageSize: 'abc',
        search: '  ',
        status: 'ACTIVE',
      }),
    ).toEqual({ page: 1, status: 'ACTIVE' });
  });

  it('floors valid page numbers and keeps filters', () => {
    expect(
      cleanListParams({
        page: 2.9,
        pageSize: 25,
        search: 'ملحمة',
      }),
    ).toEqual({ page: 2, pageSize: 25, search: 'ملحمة' });
  });
});
