import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForGameReady } from './helpers';

/**
 * Shoot the sign-on-stake screens at a landscape phone size.
 *
 * These are DOM screens mounted in an iframe by AuthOverlay, not Phaser
 * scenes, so they need no session — the welcome screen is the app's front
 * door and login is one tap past it. That makes them the cheapest screens
 * in the game to iterate on visually, which is the point of this file.
 *
 * 874x402 is an iPhone 17 Pro in landscape, the viewport the Capacitor
 * shell actually gets (Safari's own chrome makes its viewport ~64pt
 * shorter — do not judge layout from a browser capture).
 */

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '__signs__');
const PHONE = { width: 874, height: 402 };

test.use({ deviceScaleFactor: 2 });

test('the sign screens in landscape', async ({ page }) => {
  test.setTimeout(120_000);
  fs.mkdirSync(OUT, { recursive: true });

  await page.setViewportSize(PHONE);
  await page.goto('/');
  await waitForGameReady(page);

  const welcome = page.frameLocator('iframe[aria-label="A.R.C. welcome screen"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'welcome.png') });

  // One tap to the account picker — the screen Marcus called out.
  await welcome.getByRole('button', { name: /already have an account/i }).first()
    .click({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'login.png') });
});
