import { test, expect } from '@playwright/test';
import { waitForGameReady, waitForScene, collectConsoleErrors } from './helpers';

/**
 * Smoke tests — structural assertions only, no pixel comparisons.
 *
 * Runs on every CI build. Visual (screenshot) tests live in
 * visual.spec.ts and are developer-local only, because Phaser canvas
 * rendering differs across OSes and maintaining dual baselines adds
 * more pain than it's worth for a single-developer project.
 *
 * These catch the class of bug where a refactor breaks startup —
 * missing asset refs, import errors, Phaser config typos — without
 * needing a human to look at the output.
 */

test('game boots without fatal console errors', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  const initialScene = await waitForGameReady(page);
  expect(initialScene).not.toBeNull();

  // Wait a beat for deferred loads (BootScene → MainMenuScene transition).
  await page.waitForTimeout(1500);

  // Supabase calls to a real backend fail with 401 / network errors in
  // the test env; those are expected and filtered out. Only unexpected
  // exceptions (reference errors, missing imports, null derefs) fail this.
  const fatal = errors.filter((msg) =>
    !msg.includes('Failed to fetch') &&
    !msg.includes('AuthSessionMissing') &&
    !msg.includes('NetworkError') &&
    !msg.includes('status code 401') &&
    !msg.includes('Invalid API key'),
  );
  expect(fatal).toEqual([]);
});

test('reaches the main menu', async ({ page }) => {
  await page.goto('/');
  await waitForGameReady(page);
  // BootScene transitions to MainMenu after fonts + assets are ready.
  await waitForScene(page, 'MainMenuScene', 10_000);
});

test('canvas mounts at the configured viewport', async ({ page }) => {
  await page.goto('/');
  await waitForGameReady(page);

  const canvasSize = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    return { width: canvas.width, height: canvas.height };
  });

  expect(canvasSize).not.toBeNull();
  // Scale.RESIZE fills the viewport; we only assert a sensible size.
  expect(canvasSize!.width).toBeGreaterThan(1000);
  expect(canvasSize!.height).toBeGreaterThan(600);
});
