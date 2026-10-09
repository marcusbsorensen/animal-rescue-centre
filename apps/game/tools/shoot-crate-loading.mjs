/**
 * shoot-crate-loading.mjs — capture the crate loading screen.
 *
 * The Claude browser pane cannot run Phaser (WebGL framebuffer error),
 * so every look at this screen goes through Chrome under Playwright.
 *
 * Usage: node tools/shoot-crate-loading.mjs <outdir> [--picker]
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] ?? '/tmp/arc-shots';
const WITH_PICKER = process.argv.includes('--picker');
const LOADED = process.argv.includes('--loaded');
const HOVER = process.argv.includes('--hover');
const BASE = 'http://localhost:5173';
const CARGO = 'cat,bunny,dog,hedgehog,snake,bat';
const SIZES = [
  { w: 1024, h: 700, tag: '1024x700' },
  { w: 820, h: 620, tag: '820x620' },
];
const VEHICLES = [['henry', 'small-van'], ['bigtilly', 'animal-lorry']];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });

async function ready(page) {
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__;
    return !!g && g.scene.scenes.some((s) => s.sys.settings.active && s.sys.settings.key === 'PtvDriveScene');
  }, { timeout: 40_000 });
  await page.waitForTimeout(2200);
}

for (const { w, h, tag } of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.error('PAGEERROR', tag, e.message));
  await page.goto(`${BASE}/?ptvDemo=1&cargo=${CARGO}`, { waitUntil: 'load' });
  await ready(page);

  if (WITH_PICKER) {
    await page.screenshot({ path: path.join(OUT, `picker-${tag}.png`) });
  }

  for (const [tagv, id] of VEHICLES) {
    await page.goto(`${BASE}/?ptvDemo=1&cargo=${CARGO}`, { waitUntil: 'load' });
    await ready(page);
    await page.evaluate((vid) => {
      const g = window.__PHASER_GAME__;
      const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
      s.pickAndDepart(vid, { clearTint() {}, setDepth() {} }, 0, 0);
    }, id);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(OUT, `load-${tagv}-${tag}.png`) });

    if (LOADED) {
      // Vite serves the workspace source, so the rules module can be
      // imported in the page and the session driven straight through
      // its own API — the Chrome harness is not trustworthy for taps
      // (see TRAPS.md), and this is the same state a tap would reach.
      for (const [animal, slot] of [[0, 0], [2, 1]]) {
        await page.evaluate(async ([ai, si]) => {
          const m = await import('/@fs/Users/marcus/Projects/animal-rescue-centre/packages/game-logic/src/index.ts');
          const g = window.__PHASER_GAME__;
          const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
          const who = m.waitingToBoard(s.loadSession)[ai];
          s.loadSession = m.holdFromTray(s.loadSession, who.id);
          const out = m.placeHeld(s.loadSession, si);
          s.loadSession = out.session;
          s.loadNotice = null;
          s.renderView();
        }, [animal, slot]);
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `loaded-${tagv}-${tag}.png`) });

      if (HOVER) {
        // The panel repaints its own plate when the feeling changes,
        // and only a pointer resting on a bay or a chip gets it there.
        // Emitted on the hit object rather than clicked: the Chrome
        // harness is not trustworthy for real input here (TRAPS.md).
        await page.evaluate(() => {
          const g = window.__PHASER_GAME__;
          const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
          const hits = [];
          const walk = (o) => {
            if (o.input && o.input.enabled && o.getBounds) hits.push(o);
            if (o.list) o.list.forEach(walk);
          };
          s.container.list.forEach(walk);
          // A waiting animal's chip: in the tray's own quarter of the
          // screen, below the panel and right of the car park. The
          // last interactive object is the "Let's go!" button.
          const { width, height } = s.scale;
          const chip = hits.filter((o) => {
            const b = o.getBounds();
            return b.centerX > width * 0.55
              && b.centerY > height * 0.5 && b.centerY < height * 0.9;
          })[0];
          if (chip) chip.emit('pointerover');
        });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(OUT, `hover-${tagv}-${tag}.png`) });
      }
    }
  }

  await page.close();
}

await browser.close();
console.log('shots in', OUT);
