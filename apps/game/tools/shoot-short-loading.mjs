/**
 * shoot-short-loading.mjs — photograph the loading screen's two shapes.
 *
 * The Claude browser pane cannot run Phaser (WebGL "Framebuffer status:
 * Incomplete Attachment", see .claude/TRAPS.md), so every look at this
 * screen goes through real Chrome under Playwright.
 *
 * Usage: node tools/shoot-short-loading.mjs <outdir>
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] ?? '/tmp/arc-shots';
const BASE = 'http://localhost:5173';
const CARGO = 'cat,bunny,dog,hedgehog,snake,bat';

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

async function ready(page) {
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__;
    return !!g && g.scene.scenes.some(
      (s) => s.sys.settings.active && s.sys.settings.key === 'PtvDriveScene',
    );
  }, { timeout: 40_000 });
  await page.waitForTimeout(1600);
}

async function load(page, vehicle) {
  await page.evaluate((vid) => {
    const g = window.__PHASER_GAME__;
    const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
    s.pickAndDepart(vid, { clearTint() {}, setDepth() {} }, 0, 0);
  }, vehicle);
  await page.waitForTimeout(1400);
}

/** The waiting animals' grab handles and the crates, in screen coordinates. */
async function pieces(page) {
  return page.evaluate(() => {
    const g = window.__PHASER_GAME__;
    const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
    const hits = [];
    const walk = (o) => {
      if (o.input && o.input.enabled && o.getBounds) {
        const b = o.getBounds();
        hits.push({ x: b.centerX, y: b.centerY, w: b.width, h: b.height, name: o.name ?? '' });
      }
      if (o.list) o.list.forEach(walk);
    };
    s.container.list.forEach(walk);
    const crates = [];
    const crateWalk = (o) => {
      if (o.type === 'Image' && o.texture && /^crate-/.test(o.texture.key)) {
        const b = o.getBounds();
        crates.push({ x: b.centerX, y: b.centerY });
      }
      if (o.list) o.list.forEach(crateWalk);
    };
    s.container.list.forEach(crateWalk);
    return { hits, crates, height: s.scale.height, width: s.scale.width };
  });
}

async function shoot(tag, { w, h, vehicle, query = '', drag = false }) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.error('PAGEERROR', tag, e.message));
  await page.goto(`${BASE}/?ptvDemo=1&cargo=${CARGO}${query}`, { waitUntil: 'load' });
  await ready(page);
  await load(page, vehicle);

  if (drag) {
    const { hits, crates, height, width } = await pieces(page);
    // A waiting animal: a grab handle standing on the loading bay
    // floor, which is the lowest band of content on the screen.
    // A waiting animal's grab handle: square, floored at MIN_TAP, on
    // the loading bay floor. The bays are square too but live in the
    // car park's column on the left; the crates are taller than wide.
    const floor = hits
      .filter((o) => o.y > height * 0.6 && o.x > width * 0.4 && o.w <= 60 && o.h <= 60)
      .sort((a, b) => b.w - a.w);
    const animal = floor[0];
    if (!animal) throw new Error(`no waiting animal found for ${tag}`);
    // The crate nearest her, which is the one a child would reach for.
    const crate = crates.sort(
      (a, b) => Math.hypot(a.x - animal.x, a.y - animal.y) - Math.hypot(b.x - animal.x, b.y - animal.y),
    )[0];
    await page.mouse.move(animal.x, animal.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i += 1) {
      await page.mouse.move(
        animal.x + ((crate.x - animal.x) * i) / 9,
        animal.y + ((crate.y - animal.y) * i) / 9,
      );
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `${tag}.png`) });
    await page.mouse.up();
  } else {
    await page.screenshot({ path: path.join(OUT, `${tag}.png`) });
  }
  console.log('shot', tag);
  await page.close();
}

await shoot('spark-whole-820x620', { w: 820, h: 620, vehicle: 'electric-minibus' });
await shoot('short-874x402-henry', { w: 874, h: 402, vehicle: 'small-van' });
await shoot('short-874x402-spark', { w: 874, h: 402, vehicle: 'electric-minibus' });
await shoot('short-874x402-mid-drag', { w: 874, h: 402, vehicle: 'small-van', drag: true });
await shoot('short-874x402-reduced-motion', {
  w: 874, h: 402, vehicle: 'small-van', query: '&motion=reduced',
});
await shoot('short-874x402-reduced-mid-drag', {
  w: 874, h: 402, vehicle: 'small-van', query: '&motion=reduced', drag: true,
});
await shoot('tall-820x620-henry', { w: 820, h: 620, vehicle: 'small-van' });

await browser.close();
console.log('shots in', OUT);
