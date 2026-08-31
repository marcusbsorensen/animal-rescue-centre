/**
 * Shoot the sign-on-stake screens at the shipping viewports.
 *
 * The decorative animals on these pages are positioned against the sign
 * and the grass clump rather than against any ground, so on a short
 * landscape viewport they drift: the fox floats beside the sign, the dog
 * lands under the CONTINUE plank, the cat leaves the sign's top edge.
 * This is the picture of that, one PNG per page per viewport.
 *
 *   ARC_BROWSER_CHANNEL=chrome node tools/shoot-signposts.mjs <baseUrl>
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5199';
const OUT = path.resolve('e2e/__signposts__');

const PAGES = ['menu', 'welcome', 'login', 'signup', 'forgot-pin', 'friends'];
const VIEWPORTS = [
  { name: 'phone-app', width: 812, height: 375 },
  { name: 'phone-clip', width: 812, height: 325 },
  { name: 'ipad-l', width: 1024, height: 768 },
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: process.env.ARC_BROWSER_CHANNEL || undefined,
});
const ctx = await browser.newContext({ deviceScaleFactor: 2 });
const page = await ctx.newPage();

for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  for (const name of PAGES) {
    await page.goto(`${BASE}/admin/${name}.html?embed=1`, { waitUntil: 'networkidle' });
    // The hop/peek animations run on a loop; hold them still so two runs
    // of this script are comparable.
    await page.addStyleTag({
      content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${name}-${vp.name}.png`) });
  }
}

await browser.close();
console.log(`wrote ${PAGES.length * VIEWPORTS.length} shots to ${OUT}`);
