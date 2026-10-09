/**
 * measure-loading.mjs — print the loading screen's own layout numbers.
 *
 * Throwaway probe. The Claude browser pane cannot run Phaser, so every
 * measurement of this screen goes through Chrome under Playwright.
 *
 * Usage: node tools/measure-loading.mjs [WxH ...]
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5173';
const CARGO = 'cat,bunny,dog,hedgehog,snake,bat';
const ARGS = process.argv.slice(2).filter((a) => /^\d+x\d+$/.test(a));
const SIZES = (ARGS.length > 0 ? ARGS : ['1024x768', '1024x700', '820x620', '874x402', '812x375'])
  .map((s) => s.split('x').map(Number));
const VEHICLES = ['small-van', 'pedal-trike', 'long-van', 'electric-minibus', 'animal-lorry'];

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

for (const [w, h] of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.error('PAGEERROR', `${w}x${h}`, e.message));
  for (const id of VEHICLES) {
    await page.goto(`${BASE}/?ptvDemo=1&cargo=${CARGO}`, { waitUntil: 'load' });
    await ready(page);
    await page.evaluate((vid) => {
      const g = window.__PHASER_GAME__;
      const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
      s.pickAndDepart(vid, { clearTint() {}, setDepth() {} }, 0, 0);
    }, id);
    await page.waitForTimeout(1300);
    const out = await page.evaluate(() => {
      const g = window.__PHASER_GAME__;
      const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
      const park = s.container.getData('carParkVehicle');
      const all = [];
      const walk = (o) => { all.push(o); if (o.list) o.list.forEach(walk); };
      s.container.list.forEach(walk);
      const round = (b) => ({
        x: Math.round(b.x), y: Math.round(b.y),
        w: Math.round(b.width), h: Math.round(b.height),
      });
      const texts = all.filter((o) => o.type === 'Text' && o.text)
        .map((o) => ({ t: o.text.slice(0, 26), ...round(o.getBounds()) }));
      const sprite = all.filter(
        (o) => o.type === 'Image' && o.texture && /vehicle-topdown/.test(o.texture.key)
          && o.name !== 'vehicle-shadow',
      ).sort((a, b) => b.displayWidth - a.displayWidth)[0];
      const crates = all.filter(
        (o) => o.type === 'Image' && o.texture && /crate/.test(o.texture.key),
      ).map((o) => ({
        w: Math.round(o.displayWidth),
        cy: Math.round(o.getBounds().centerY),
        cx: Math.round(o.getBounds().centerX),
      }));
      const animals = all.filter(
        (o) => o.type === 'Image' && o.texture
          && /^(dog|cat|fox|bunny|snake|parrot|hedgehog|bat)-/.test(o.texture.key),
      ).map((o) => ({ k: o.texture.key, w: Math.round(o.displayWidth), bottom: Math.round(o.getBounds().bottom) }));
      return {
        column: park ? park.column : null,
        sprite: sprite ? {
          w: Math.round(sprite.displayWidth), h: Math.round(sprite.displayHeight),
          top: Math.round(sprite.y - sprite.displayHeight / 2),
          cropped: sprite.isCropped,
        } : null,
        title: texts.find((t) => /^LOAD /.test(t.t)) ?? null,
        crates,
        animals,
        marks: texts.filter((t) => /Waiting|Crates|Let's|back$/i.test(t.t)),
      };
    });
    const c = out.column;
    const crateW = [...new Set(out.crates.map((k) => k.w))].sort((a, b) => a - b);
    const crateRows = [...new Set(out.crates.map((k) => k.cy))].length;
    const crateCols = [...new Set(out.crates.map((k) => k.cx))].length;
    const floorA = out.animals.filter((a) => /-sheltered|-walking|-playing/.test(a.k));
    const dog = Math.max(0, ...floorA.map((a) => a.w));
    const feet = [...new Set(floorA.map((a) => a.bottom))].join(',');
    console.log(
      `${w}x${h} ${id.padEnd(17)} column `
      + `${c ? `${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.w)}x${Math.round(c.h)}` : '-'}`
      + ` | sprite ${out.sprite?.w}x${out.sprite?.h} top=${out.sprite?.top}`
      + ` ${out.sprite?.cropped ? 'CROPPED' : 'whole'}`
      + ` | crates ${crateW.join('/')} ${crateCols}x${crateRows} | biggest animal ${dog} feet=${feet}`,
    );
    if (id === VEHICLES[0]) {
      console.log('   title', JSON.stringify(out.title));
      console.log('   marks', JSON.stringify(out.marks));
    }
  }
  await page.close();
}

await browser.close();
