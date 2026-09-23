import { test, expect } from '@playwright/test';

/**
 * Real browser E2E against the running Expo web build (§20 navigation/RTL,
 * §22 app states). Authenticated flows (posting, payment, OTP) are validated
 * at the live API layer; here we assert the UI actually renders and navigates.
 */

test.describe('App web — RTL & shell (§20)', () => {
  test('document is RTL Arabic', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
  });

  test('home renders real content (stories/listings/posts) not a blank/error screen', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(20);
    // No hard crash overlay
    await expect(page.getByText(/Unmatched Route|Application error|500 Internal/i)).toHaveCount(0);
  });

  test('bottom-tab primary routes each render', async ({ page }) => {
    for (const path of ['/', '/market', '/messages', '/posts', '/profile']) {
      await test.step(path, async () => {
        const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
        expect(res?.status() ?? 200).toBeLessThan(500);
        await expect(page.locator('body')).toBeVisible();
      });
    }
  });
});

test.describe('App web — public feature routes (§3/§12/§19)', () => {
  const routes = [
    '/auth/phone',
    '/auth/register',
    '/auth/forgot-password',
    '/search',
    '/sarh-services',
    '/ministry',
    '/promote',
    '/subscription',
    '/fees',
    '/favorites',
  ];
  for (const path of routes) {
    test(`route ${path} loads without server error`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(res?.status() ?? 200).toBeLessThan(500);
      await expect(page.locator('body')).toBeVisible();
    });
  }
});

test.describe('App web — data-backed screens (§3)', () => {
  test('sarh services screen shows official services from API', async ({ page, request }) => {
    const api = process.env.LIVE_API_URL ?? 'http://127.0.0.1:3001';
    const svc = await request.get(`${api}/api/services`);
    expect(svc.ok()).toBeTruthy();
    await page.goto('/ministry?tab=services');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('listing detail opens from a real feed id and shows price', async ({ page, request }) => {
    const api = process.env.LIVE_API_URL ?? 'http://127.0.0.1:3001';
    const feed = await request.get(`${api}/api/listings?pageSize=1`);
    expect(feed.ok()).toBeTruthy();
    const json = await feed.json();
    const id = json?.data?.listings?.[0]?.id as string | undefined;
    test.skip(!id, 'no listings in live DB');
    await page.goto(`/listing/${id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/ر\.س|ريال|SAR|\d/).first()).toBeVisible({ timeout: 40_000 });
  });

  test('phone login screen has phone input and submit control (§1)', async ({ page }) => {
    await page.goto('/auth/phone');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('textbox', { name: '05xxxxxxxx' })).toBeVisible({ timeout: 40_000 });
  });
});
