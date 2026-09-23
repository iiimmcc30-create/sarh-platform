export type DashboardHref =
  | '/dashboard'
  | '/dashboard/orders'
  | '/dashboard/products'
  | '/dashboard/inventory'
  | '/dashboard/customers'
  | '/dashboard/reports'
  | '/dashboard/settings';

export const DASHBOARD_NAV: { href: DashboardHref; label: string }[] = [
  { href: '/dashboard', label: 'الرئيسية' },
  { href: '/dashboard/orders', label: 'الطلبات' },
  { href: '/dashboard/products', label: 'المنتجات' },
  { href: '/dashboard/inventory', label: 'المخزون' },
  { href: '/dashboard/customers', label: 'العملاء' },
  { href: '/dashboard/reports', label: 'التقارير' },
  { href: '/dashboard/settings', label: 'الإعدادات' },
];

export function isNavActive(pathname: string, href: DashboardHref): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}
