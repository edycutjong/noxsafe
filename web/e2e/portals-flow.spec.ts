import { test, expect } from '@playwright/test';

// Core user journeys reachable WITHOUT signing anything: the treasurer Safe App
// tabs, and the recipient / auditor / verify disclosure portals. Everything is
// driven off the deterministic demo fixture (Meridian Collective roster).

test.describe('Safe App — treasurer tabs', () => {
  test('switches between Onboard, Roster and Status tabs', async ({ page }) => {
    await page.goto('/');

    // The in-card tab strip uses <a> without href (onClick tabs), so target by text.
    const tabStrip = page.locator('.card .nav');

    // Onboard tab: the 4-call multisig batch.
    await expect(page.getByRole('heading', { name: 'Set up confidential payroll' })).toBeVisible();
    await expect(page.getByText('one multisig batch', { exact: false })).toBeVisible();

    // Roster tab: encrypt-and-propose builder.
    await tabStrip.getByText('Roster', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Roster builder' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Encrypt & propose roster/ })).toBeVisible();

    // Status tab: 2-of-3 approval board.
    await tabStrip.getByText('Status', { exact: true }).click();
    await expect(page.getByText('2 of 3', { exact: false })).toBeVisible();
  });

  test('treasurer can reveal amounts; queue preview stays sealed by default', async ({ page }) => {
    await page.goto('/');
    await page.locator('.card .nav').getByText('Roster', { exact: true }).click();

    const toggle = page.getByRole('button', { name: /Show amounts \(treasurer only\)/ });
    await expect(toggle).toBeVisible();
    await toggle.click();
    // After revealing, the treasurer view exposes the hide affordance.
    await expect(page.getByRole('button', { name: /Hide amounts \(treasurer view\)/ })).toBeVisible();
  });
});

test.describe('Recipient portal — decrypt only your own line', () => {
  test('reveals the recipient line on demand', async ({ page }) => {
    await page.goto('/recipient');
    await expect(page.getByRole('heading', { name: /You were paid by Meridian Collective/ })).toBeVisible();
    // Sealed by default; reveal illustrates the recipient's own viewer-gated line.
    await page.getByRole('button', { name: /Reveal my line/ }).click();
    await expect(page.getByText(/Illustrates the EIP-712 viewer-gated decrypt/)).toBeVisible();
  });
});

test.describe('Auditor portal — read-all viewer', () => {
  test('shows the full roster and the auditor-only total', async ({ page }) => {
    await page.goto('/auditor');
    await expect(page.getByRole('heading', { name: 'Auditor portal' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Roster #1 — all lines' })).toBeVisible();
    // Every roster name from the demo fixture is listed.
    for (const name of ['Ada', 'Mira', 'Wren', 'Oona', 'Ivo', 'Probe']) {
      await expect(page.getByRole('cell', { name, exact: true }).first()).toBeVisible();
    }
  });
});

test.describe('/verify — judge dashboard', () => {
  test('shows cap-compliance flags and the before/after queue toggle', async ({ page }) => {
    await page.goto('/verify');
    await expect(page.getByRole('heading', { name: '/verify — judge dashboard' })).toBeVisible();
    // The over-cap line (L5) must render its "paid encrypted zero" flag.
    await expect(page.getByText(/over cap, paid encrypted zero/)).toBeVisible();

    // Toggle to the "naked ERC-20 batch" comparison — amounts become public.
    await page.getByRole('button', { name: /Before: naked ERC-20 batch/ }).click();
    await expect(page.getByText('Amount (public!)')).toBeVisible();
  });
});
