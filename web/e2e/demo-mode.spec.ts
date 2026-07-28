import { test, expect } from '@playwright/test';

// NoxSafe runs entirely in DEMO MODE for these tests: no wallet connection,
// no env vars, no live chain / gateway. Every route must render from the local
// demo fixture without errors.

const ROUTES = ['/', '/recipient', '/auditor', '/verify'];

test.describe('Demo mode — loads without wallet or API keys', () => {
  test('home page renders the Safe App shell and brand', async ({ page }) => {
    await page.goto('/');
    // Global brand header (in layout.tsx) is present on every route.
    await expect(page.getByRole('heading', { name: 'NoxSafe', level: 1 })).toBeVisible();
    // Safe App positioning copy now lives in the product-section eyebrow; heading is "Try the treasurer flow".
    await expect(page.getByText(/runs inside app\.safe\.global/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Try the treasurer flow/i })).toBeVisible();
  });

  test('correct document title + meta description', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/NoxSafe — Confidential Payroll for Safe/);
    const desc = page.locator('meta[name="description"]');
    await expect(desc).toHaveAttribute('content', /encrypted end-to-end/);
  });

  test('OpenGraph image + Twitter card meta are wired for share previews', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og-image\.png/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  });

  for (const route of ROUTES) {
    test(`no console errors on ${route}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(route);
      await expect(page.locator('.brand h1')).toHaveText('NoxSafe');
      // No React error overlay / uncaught exceptions.
      expect(errors, `console errors on ${route}: ${errors.join('\n')}`).toHaveLength(0);
    });
  }
});
