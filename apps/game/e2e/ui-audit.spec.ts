import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForGameReady, waitForScene, mintRealSession, installSession } from './helpers';

/**
 * Shoot every screen a child actually crosses, at the viewport the app
 * ships in, for a UI audit.
 *
 * 874x402 is an iPhone 17 Pro in landscape — the Capacitor shell's real
 * viewport. Not Safari's, which is ~64pt shorter and will make any
 * layout judged in it wrong.
 *
 * deviceScaleFactor 1 on purpose: these are read by eye for composition,
 * typography and visual consistency, not for retina artefacts, and a 2x
 * capture of twelve screens is a lot of pixels to carry around.
 *
 * The bottom-bar layout, not the side-rail prototype — the audit is of
 * what ships today.
 */

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '__audit__');
const PHONE = { width: 874, height: 402 };

test.use({ deviceScaleFactor: 1 });

type Page = import('@playwright/test').Page;

async function shoot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

test('the screens a child crosses', async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(OUT, { recursive: true });

  // ── Unauthenticated DOM screens ──────────────────────
  await page.setViewportSize(PHONE);
  await page.goto('/?sideRail=0');
  await waitForGameReady(page);

  const welcome = page.frameLocator('iframe[aria-label="A.R.C. welcome screen"]');
  await shoot(page, '01-welcome');

  await welcome.getByRole('button', { name: /already have an account/i }).first().click({ timeout: 20_000 });
  await shoot(page, '02-login');

  // ── Authenticated: menu, then the game views ─────────
  const session = await mintRealSession();
  await installSession(page, session);
  await page.goto('/?sideRail=0');
  await waitForGameReady(page);
  await shoot(page, '03-menu');

  await page.frameLocator('iframe[aria-label="A.R.C. menu screen"]')
    .locator('#continue-btn').click({ timeout: 30_000 });
  await shoot(page, '04-intro');

  await page.frameLocator('iframe[aria-label="A.R.C. intro screen"]')
    .locator('#stage').click({ timeout: 30_000 });
  await waitForScene(page, 'GameScene', 30_000);
  await page.waitForTimeout(2500);
  await shoot(page, '05-corridor-or-arrival');

  // Answer the arrival plaque if it is up, then shoot the corridor clean.
  try {
    await page.frameLocator('iframe[aria-label="A.R.C. arrival screen"]')
      .locator('#welcome-btn, .choice-welcome').first().click({ timeout: 4000 });
    await shoot(page, '06-corridor');
  } catch { /* no plaque */ }

  // Drive the views from the scene rather than by tapping painted signs,
  // which move with the layout and would make this brittle.
  const go = async (mode: string, name: string): Promise<void> => {
    await page.evaluate((m) => {
      const g = (window as unknown as { __PHASER_GAME__: Phaser.Game }).__PHASER_GAME__;
      const s = g.scene.getScene('GameScene') as unknown as {
        viewMode: string; renderView: () => void;
      };
      s.viewMode = m;
      s.renderView();
    }, mode);
    await shoot(page, name);
  };

  await go('kitchen', '07-kitchen');
  await go('garden', '08-garden');
  await go('room', '09-room');
  await go('corridor', '10-corridor-clean');
});
