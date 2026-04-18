import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for A.R.C. visual regression + smoke tests.
 *
 * Canvas-based Phaser games don't expose a DOM we can assert against,
 * so the primary strategy here is full-page screenshots compared
 * against committed baselines. Phaser rendering is not pixel-
 * deterministic across machines (font hinting, antialiasing), so we
 * run with a relatively generous `maxDiffPixelRatio`.
 *
 * To update baselines after an intentional visual change:
 *   pnpm --filter @arc/game test:visual -- --update-snapshots
 *
 * Baselines live in e2e/__screenshots__/ and are committed to git.
 */
export default defineConfig({
  testDir: './e2e',
  // CI only runs the structural smoke tests — visual snapshot tests
  // produce darwin/linux pixel diffs that would just add noise for a
  // single-developer project. Devs run `pnpm test:visual` locally to
  // catch visual regressions on their own machine.
  testIgnore: process.env.CI ? ['**/visual.spec.ts'] : [],
  timeout: 45_000,
  fullyParallel: false,        // game tests share localStorage — serialise
  retries: process.env.CI ? 1 : 0,
  workers: 1,                   // see above
  reporter: process.env.CI ? 'github' : 'list',

  // Always use Vite's dev server — simpler than juggling a separate
  // preview build path and the on-the-fly esbuild is fast enough that
  // CI doesn't benefit from preview mode. The game doesn't exercise
  // any prod-only behaviour we care about testing.
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Canvas snapshots need a fixed viewport.
    viewport: { width: 1280, height: 720 },
    // Short trace when tests fail, for debugging.
    trace: 'on-first-retry',
    // Force consistent locale + timezone so dates don't surprise us.
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    // Disable animations at the CSS layer. Phaser tweens are a separate
    // concern handled per-test (we wait for the scene to settle before
    // screenshotting).
    launchOptions: {
      args: ['--disable-web-animations'],
    },
  },

  expect: {
    toHaveScreenshot: {
      // Canvas rendering varies slightly across machines — allow up to
      // 1% of pixels to differ with a small per-pixel threshold.
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
      animations: 'disabled',
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
