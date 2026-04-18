import type { Page } from '@playwright/test';

/**
 * Shared helpers for A.R.C. e2e tests.
 *
 * Canvas-based Phaser games present two testing challenges:
 * 1. Nothing in the DOM to assert against — we work with the canvas
 *    size + window object.
 * 2. Scene transitions and tweens need to settle before we screenshot.
 *
 * These helpers paper over the basics.
 */

/**
 * Wait for Phaser's game object to exist on window — it is exposed in
 * dev mode via main.ts (`window.__PHASER_GAME__`). Returns the current
 * active scene key, or null if the object isn't present (prod build).
 */
export async function waitForGameReady(page: Page, timeoutMs = 25_000): Promise<string | null> {
  await page.waitForFunction(
    () => {
      const g = (window as unknown as { __PHASER_GAME__?: { scene: { scenes: Array<{ sys: { settings: { key: string; active: boolean } } }> } } }).__PHASER_GAME__;
      if (!g) return false;
      // Ready when at least one scene is active and beyond the Boot phase.
      return g.scene.scenes.some((s) => s.sys.settings.active);
    },
    { timeout: timeoutMs },
  );

  return await page.evaluate(() => {
    const g = (window as unknown as { __PHASER_GAME__?: { scene: { scenes: Array<{ sys: { settings: { key: string; active: boolean } } }> } } }).__PHASER_GAME__;
    if (!g) return null;
    const active = g.scene.scenes.find((s) => s.sys.settings.active);
    return active?.sys.settings.key ?? null;
  });
}

/**
 * Wait for a specific scene key to become active.
 */
export async function waitForScene(page: Page, key: string, timeoutMs = 15_000): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const g = (window as unknown as { __PHASER_GAME__?: { scene: { scenes: Array<{ sys: { settings: { key: string; active: boolean } } }> } } }).__PHASER_GAME__;
      if (!g) return false;
      return g.scene.scenes.some((s) => s.sys.settings.active && s.sys.settings.key === expected);
    },
    key,
    { timeout: timeoutMs },
  );
}

/**
 * Seed a fake session into localStorage so the game treats us as
 * signed-in. Supabase calls will still fail (no real network), but
 * the UI state machine will advance past the login gate.
 */
export async function seedFakeSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('arc_session', JSON.stringify({
      userId: '00000000-0000-0000-0000-000000000001',
      username: 'TestKid',
      avatarEmoji: '🦊',
      avatarBgColour: '#BAE1FF',
      joinCode: 'TEST-0001',
      token: 'playwright-fake-token',
    }));
  });
}

/**
 * Collect any JavaScript runtime errors reported via the page console.
 * Attach at the start of a test, check at the end.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}
