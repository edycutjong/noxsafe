import { test, expect } from '@playwright/test';

// Layout must hold at mobile / tablet / desktop widths. Safe Apps render inside
// a narrow iframe, so mobile fidelity matters. NoxSafe is a data-dense payroll
// tool: its wide roster/queue tables are intentionally horizontally scrollable,
// but the page CHROME (brand header + nav) must always fit the viewport and the
// primary controls must stay reachable.

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const ROUTES = ['/', '/recipient', '/auditor', '/verify'];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of ROUTES) {
      test(`page chrome fits the viewport on ${route}`, async ({ page }) => {
        await page.goto(route);
        await expect(page.locator('.brand h1')).toHaveText('NoxSafe');

        // The header/brand block must never overflow horizontally, regardless of
        // how wide the data tables inside a card get.
        const brand = page.locator('.brand');
        const box = await brand.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeLessThanOrEqual(vp.width + 1);

        // The intro heading of the route is fully within the viewport (not clipped
        // by any runaway sibling), confirming the primary content column reflows.
        const heading = page.locator('h2').first();
        const hbox = await heading.boundingBox();
        expect(hbox).not.toBeNull();
        expect(hbox!.x).toBeGreaterThanOrEqual(0);
        expect(hbox!.x + hbox!.width).toBeLessThanOrEqual(vp.width + 1);
      });
    }

    test('primary nav is reachable', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('link', { name: 'Recipient portal' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Auditor portal' })).toBeVisible();
    });
  });
}
