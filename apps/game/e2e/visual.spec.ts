import { test, expect } from '@playwright/test';
import { waitForGameReady, waitForScene } from './helpers';

/**
 * Visual regression tests — pixel-comparison against committed baselines.
 *
 * Developer-local only. These don't run on CI because Phaser canvas
 * rendering differs subtly across OSes and maintaining separate
 * darwin/linux baselines creates more noise than signal.
 *
 * To generate the first baseline on your machine:
 *   pnpm --filter @arc/game test:visual:update
 *
 * To check for regressions after a change:
 *   pnpm --filter @arc/game test:visual
 *
 * Failures open a diff in pnpm --filter @arc/game test:visual:report.
 *
 * Tagged @visual so CI can exclude them (config skips this file via
 * testIgnore when CI=true — see playwright.config.ts).
 */

test('main menu visual baseline', async ({ page }) => {
  await page.goto('/');
  await waitForGameReady(page);
  await waitForScene(page, 'MainMenuScene', 10_000);
  // Let menu animations settle before snapshotting.
  await page.waitForTimeout(500);

  await expect(page).toHaveScreenshot('main-menu.png', { fullPage: false });
});
