import { test, expect, loginAsAdmin, ADMIN_SECTIONS } from './fixtures';

test.describe('Admin panel — real browser E2E', () => {
  test('rejects bad credentials and stays on login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="login"]').fill('wrong_user');
    await page.locator('input[name="password"]').fill('wrong-password');
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('text=بيانات الدخول غير صحيحة').or(page.locator('text=فشل'))).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test('login → dashboard shows live stats', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL('/');
    await expect(page.getByText('لوحة التحكم').first()).toBeVisible();
    // Stats cards from live API
    await expect(page.getByText('المستخدمون').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('الإعلانات').first()).toBeVisible();
    await expect(page.getByText('المنشورات').first()).toBeVisible();
  });

  test('after login, every sidebar section loads without crash', async ({ page }) => {
    await loginAsAdmin(page);

    for (const section of ADMIN_SECTIONS) {
      await test.step(`open ${section.path} (${section.navLabel})`, async () => {
        await page.getByRole('link', { name: section.navLabel, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${section.path === '/' ? '/$' : section.path}`));
        // Page should not bounce back to login and should render main shell
        await expect(page.locator('aside')).toBeVisible();
        await expect(page.getByText(/خطأ في الخادم|تعذّر الاتصال بالخادم/)).toHaveCount(0);
        // Content area visible (not stuck forever on blank)
        await expect(page.locator('main, [class*="flex-1"]').first()).toBeVisible();
      });
    }
  });

  test('listings + posts + plans + orders sections show admin content', async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole('link', { name: 'الإعلانات', exact: true }).click();
    await expect(page.getByText('إدارة الإعلانات')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('link', { name: 'المنشورات', exact: true }).click();
    await expect(page.getByText('إدارة المنشورات')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('link', { name: 'الباقات', exact: true }).click();
    await expect(page.getByText('إدارة الباقات')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('link', { name: 'الطلبات', exact: true }).click();
    await expect(page.getByText('إدارة الطلبات')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('link', { name: 'الدعم والمساعدة', exact: true }).click();
    await expect(page.getByText('الدعم والمساعدة').first()).toBeVisible({ timeout: 20_000 });
  });

  test('logout clears session and returns to login', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await page.waitForURL(/\/login/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
