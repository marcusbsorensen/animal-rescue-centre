import { defineConfig } from '@playwright/test';

/**
 * The live client (main) against a LOCAL Supabase stack only. See
 * old-client-compat.spec.ts. No webServer: the builds are served by hand.
 */
const OUT = process.env.ARC_COMPAT_OUT ?? 'test-results/compat';

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  outputDir: `${OUT}/pw`,
  use: {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 720 },
    serviceWorkers: 'block',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Belt and braces with the route guard in the spec: a hosted project
      // cannot even be resolved from this browser.
      args: [
        '--host-resolver-rules=MAP *.supabase.co ~NOTFOUND, MAP *.supabase.in ~NOTFOUND, MAP supabase.com ~NOTFOUND, MAP *.supabase.com ~NOTFOUND',
        '--disable-web-animations',
      ],
    },
  },
});
