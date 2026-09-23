import { test as base, expect, type Page } from '@playwright/test';

export const ADMIN_LOGIN = process.env.ADMIN_E2E_LOGIN ?? 'e2e_admin';
export const ADMIN_PASSWORD = process.env.ADMIN_E2E_PASSWORD ?? 'E2eAdmin!234';

export const ADMIN_SECTIONS: { path: string; navLabel: string }[] = [
  { path: '/', navLabel: 'لوحة التحكم' },
  { path: '/users', navLabel: 'المستخدمون' },
  { path: '/posts', navLabel: 'المنشورات' },
  { path: '/editorial-stories', navLabel: 'ستوريات' },
  { path: '/knowledge', navLabel: 'مركز المعرفة' },
  { path: '/ministry', navLabel: 'وزارة البيئة والمياه والزراعة' },
  { path: '/listings', navLabel: 'الإعلانات' },
  { path: '/reports', navLabel: 'البلاغات' },
  { path: '/support', navLabel: 'الدعم والمساعدة' },
  { path: '/live', navLabel: 'البث المباشر' },
  { path: '/butchers', navLabel: 'الملاحم' },
  { path: '/butcher-banners', navLabel: 'بنرات الملاحم' },
  { path: '/explore-sarh-banners', navLabel: 'بنرات استكشف سرح' },
  { path: '/applications', navLabel: 'طلبات الملاحم' },
  { path: '/orders', navLabel: 'الطلبات' },
  { path: '/plans', navLabel: 'الباقات' },
  { path: '/content', navLabel: 'السياسات والمحتوى' },
  { path: '/settings', navLabel: 'الإعدادات' },
];

export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'سرح' })).toBeVisible();
  await page.locator('input[name="login"]').fill(ADMIN_LOGIN);
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

export const test = base.extend({});
export { expect };
