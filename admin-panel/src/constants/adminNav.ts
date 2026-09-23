/**
 * Primary admin sidebar navigation — single source of truth for routes + labels.
 * Keep in sync with pages under `src/app/(dashboard)/`.
 */
export type AdminNavItem = {
  href: string;
  label: string;
};

/** Top-level sidebar sections (detail routes live under these prefixes). */
export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/', label: 'لوحة التحكم' },
  { href: '/health', label: 'صحة النظام' },
  { href: '/payments', label: 'المدفوعات' },
  { href: '/commissions', label: 'العمولات' },
  { href: '/users', label: 'المستخدمون' },
  { href: '/posts', label: 'المنشورات' },
  { href: '/editorial-stories', label: 'ستوريات' },
  { href: '/knowledge', label: 'مركز المعرفة' },
  { href: '/ministry', label: 'وزارة البيئة والمياه والزراعة' },
  { href: '/listings', label: 'الإعلانات' },
  { href: '/categories', label: 'تصنيفات السوق' },
  { href: '/reports', label: 'البلاغات' },
  { href: '/support', label: 'خدمة العملاء' },
  { href: '/live', label: 'البث المباشر' },
  { href: '/butchers', label: 'الملاحم' },
  { href: '/butcher-banners', label: 'بنرات الملاحم' },
  { href: '/explore-sarh-banners', label: 'بنرات استكشف سرح' },
  { href: '/feed-suppliers', label: 'موردو الأعلاف' },
  { href: '/applications', label: 'طلبات الملاحم' },
  { href: '/orders', label: 'الطلبات' },
  { href: '/plans', label: 'الباقات' },
  { href: '/content', label: 'السياسات والمحتوى' },
  { href: '/home-explore', label: 'استكشف سرح' },
  { href: '/settings', label: 'الإعدادات' },
];

/** All admin UI routes that must be reachable after login (including nested). */
export const ADMIN_FEATURE_ROUTES = [
  '/login',
  '/',
  '/health',
  '/payments',
  '/commissions',
  '/users',
  '/users/[id]',
  '/posts',
  '/editorial-stories',
  '/knowledge',
  '/ministry',
  '/official-services',
  '/listings',
  '/categories',
  '/reports',
  '/reports/[id]',
  '/support',
  '/support/faqs',
  '/support/tickets',
  '/support/tickets/[id]',
  '/support/verification',
  '/support/verification/[id]',
  '/live',
  '/butchers',
  '/butcher-banners',
  '/explore-sarh-banners',
  '/feed-suppliers',
  '/applications',
  '/orders',
  '/orders/[id]',
  '/plans',
  '/plans/[id]',
  '/content',
  '/home-explore',
  '/settings',
] as const;

export function isAdminNavActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
