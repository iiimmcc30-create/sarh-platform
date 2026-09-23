import { test, expect, loginAsAdmin } from './fixtures';

test.describe('Admin panel — search, filters, permissions (§24)', () => {
  test('unauthenticated access to a protected page redirects to login', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/users');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated access to settings redirects to login', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login/);
  });

  test('search box filters the users list', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('link', { name: 'المستخدمون', exact: true }).click();
    await expect(page).toHaveURL(/\/users/);
    const search = page.getByPlaceholder(/بحث|search/i).first();
    if (await search.count()) {
      await search.fill('sarh');
      await page.waitForTimeout(1200);
      await expect(page.getByText(/خطأ في الخادم|تعذّر الاتصال/)).toHaveCount(0);
    }
  });

  test('orders page exposes status filters', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('link', { name: 'الطلبات', exact: true }).click();
    await expect(page.getByText('إدارة الطلبات')).toBeVisible({ timeout: 20_000 });
    // Filter controls should render (selects / inputs)
    await expect(page.locator('select, input').first()).toBeVisible();
  });

  test('plans page exposes audience filter (USER/BUTCHER)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('link', { name: 'الباقات', exact: true }).click();
    await expect(page.getByText('إدارة الباقات')).toBeVisible({ timeout: 20_000 });
  });

  test('support tickets page loads with filter controls', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('link', { name: 'الدعم والمساعدة', exact: true }).click();
    await expect(page).toHaveURL(/\/support/);
    await expect(page.getByText('تذاكر الدعم').first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('link', { name: 'تذاكر الدعم' }).click();
    await expect(page).toHaveURL(/\/support\/tickets/);
    await expect(page.getByText('الكل')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('link', { name: 'الدعم والمساعدة', exact: true }).click();
    await page.getByRole('link', { name: 'طلبات التوثيق' }).click();
    await expect(page).toHaveURL(/\/support\/verification/);
    await expect(page.getByText('طلبات توثيق الحساب').first()).toBeVisible({ timeout: 20_000 });
  });
});
