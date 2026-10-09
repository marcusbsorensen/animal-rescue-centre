/**
 * shoot-car-park.mjs — photograph the loading screen's car park, and
 * measure whether the vehicle in it is whole.
 *
 * The Claude browser pane cannot run Phaser (WebGL framebuffer error), so
 * this goes through real Chrome under Playwright. Run it from apps/game so
 * `@playwright/test` resolves.
 *
 *   node tools/shoot-car-park.mjs <outdir> [--base http://localhost:5173]
 *        [--tag before|after] [--vehicles pedal-trike,animal-lorry]
 *        [--sizes 820x620,1024x700] [--arrows] [--walk more,fewer,...]
 *        [--keys] [--fill]
 *
 * `--arrows` draws the vehicle-change arrows over the screen the way the
 * loading view will once it passes `onVehicleChange` to `drawCarPark`. The
 * view does not wire them itself yet, so until it does this is how the
 * arrows are seen. `--walk` presses them in turn and photographs each
 * result, which exercises the callback, `changeVehicle` and the redraw
 * end to end; `--keys` presses the left and right arrow keys instead of
 * the plates; `--mouse` clicks the middle of the plate with a real mouse
 * rather than emitting the event; `--fill` seats animals in the first spaces that take them
 * before the walk, so a move to a smaller vehicle has somebody to return.
 *
 * Every shot prints a line of numbers next to it: the vehicle's drawn
 * bounds, whether it is cropped, and whether it is inside the frame. A
 * screenshot of a cropped vehicle looks plausible; the numbers do not.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const OUT = args[0] ?? '/tmp/arc-car-park';
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = opt('--base', 'http://localhost:5173');
const TAG = opt('--tag', 'shot');
const ARROWS = args.includes('--arrows');
const WALK = opt('--walk', '').split(',').filter(Boolean);
const KEYS = args.includes('--keys');
const MOUSE = args.includes('--mouse');
const FILL = args.includes('--fill');
const CARGO = 'cat,bunny,dog,hedgehog,snake,bat';
const SIZES = opt('--sizes', '820x620,1024x700').split(',').map((s) => {
  const [w, h] = s.split('x').map(Number);
  return { w, h, tag: s };
});
const VEHICLES = opt('--vehicles', 'pedal-trike,animal-lorry').split(',');
const SHORT = { 'pedal-trike': 'trikey', 'small-van': 'henry', 'long-van': 'bea', 'electric-minibus': 'spark', 'animal-lorry': 'bigtilly' };

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

async function ready(page) {
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__;
    return !!g && g.scene.scenes.some((s) => s.sys.settings.active && s.sys.settings.key === 'PtvDriveScene');
  }, { timeout: 40_000 });
  await page.waitForTimeout(2200);
}

/** What the page can say about the vehicle on screen. */
function measure() {
  const g = window.__PHASER_GAME__;
  const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
  const { width, height } = s.scale;
  const found = [];
  const walk = (o) => {
    if (o.type === 'Image' && o.name !== 'vehicle-shadow' && typeof o.texture?.key === 'string' && o.texture.key.startsWith('vehicle-topdown-')) {
      const b = o.getBounds();
      found.push({
        key: o.texture.key,
        x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
        cropped: !!o.isCropped,
        inFrame: b.x >= -0.5 && b.y >= -0.5 && b.right <= width + 0.5 && b.bottom <= height + 0.5,
      });
    }
    if (o.list) o.list.forEach(walk);
  };
  s.container.list.forEach(walk);
  return { viewport: { width, height }, vehicles: found, vehicleId: s.vehicleId };
}

for (const { w, h, tag } of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.error('PAGEERROR', tag, e.message));

  if (args.includes('--picker')) {
    // The forecourt picker, before anything is chosen.
    await page.goto(`${BASE}/?ptvDemo=1&cargo=${CARGO}`, { waitUntil: 'load' });
    await ready(page);
    await page.screenshot({ path: path.join(OUT, `${TAG}-picker-${tag}.png`) });
    console.log(`${TAG} picker-${tag}`, JSON.stringify(await page.evaluate(measure)));
  }

  for (const id of VEHICLES) {
    await page.goto(`${BASE}/?ptvDemo=1&cargo=${CARGO}`, { waitUntil: 'load' });
    await ready(page);
    await page.evaluate((vid) => {
      const g = window.__PHASER_GAME__;
      const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
      s.pickAndDepart(vid, { clearTint() {}, setDepth() {} }, 0, 0);
    }, id);
    await page.waitForTimeout(1400);

    if (FILL) {
      await page.evaluate(async (logicPath) => {
        const m = await import(/* @vite-ignore */ logicPath);
        const g = window.__PHASER_GAME__;
        const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
        for (const who of m.waitingToBoard(s.loadSession)) {
          s.loadSession = m.holdFromTray(s.loadSession, who.id);
          for (let slot = 0; slot < m.slotCount(s.loadSession); slot += 1) {
            const out = m.placeHeld(s.loadSession, slot);
            if (out.placed) { s.loadSession = out.session; break; }
          }
          s.loadSession = m.putHeldBack(s.loadSession);
        }
        s.loadNotice = null;
        s.renderView();
      }, `/@fs${path.resolve(process.cwd(), '../../packages/game-logic/src/index.ts')}`);
      await page.waitForTimeout(500);
    }

    if (ARROWS) {
      // The wiring the loading view will do, done from the page. The
      // callback applies the overflow rule and redraws, so a press here
      // goes through exactly what a press will go through.
      await page.evaluate(async (logicPath) => {
        const park = await import('/src/driving/car-park.ts');
        const logic = await import(/* @vite-ignore */ logicPath);
        const g = window.__PHASER_GAME__;
        const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
        window.__arrowsLog = [];
        const draw = () => {
          // The numbers drawCarPark left on the container: the column it
          // was given and the rectangle it parked the vehicle in.
          const note = s.container.getData('carParkVehicle');
          park.drawVehicleArrows(s, s.container, {
            chosen: s.vehicleId,
            column: note.column,
            vehicleRect: note.vehicleRect,
            onVehicleChange: (to) => {
              window.__arrowsLog.push(to);
              const out = logic.changeVehicle(s.loadSession, to);
              s.vehicleId = to;
              s.loadSession = out.session;
              s.loadNotice = out.message ? { level: null, text: out.message } : null;
              s.renderView();
              window.requestAnimationFrame(() => draw());
            },
          });
        };
        window.__drawArrows = draw;
        draw();
      }, `/@fs${path.resolve(process.cwd(), '../../packages/game-logic/src/index.ts')}`);
      await page.waitForTimeout(300);
    }

    const base = `${SHORT[id] ?? id}-${tag}`;
    await page.screenshot({ path: path.join(OUT, `${TAG}-${base}.png`) });
    console.log(`${TAG} ${base}`, JSON.stringify(await page.evaluate(measure)));

    for (const [n, dir] of WALK.entries()) {
      if (KEYS) {
        await page.keyboard.press(dir === 'more' ? 'ArrowRight' : 'ArrowLeft');
      } else if (MOUSE) {
        const at = await page.evaluate((d) => {
          const g = window.__PHASER_GAME__;
          const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
          let found;
          const walk = (o) => {
            if (o.input && o.input.enabled && o.name === `vehicle-arrow-${d}`) found = o;
            if (o.list) o.list.forEach(walk);
          };
          s.container.list.forEach(walk);
          if (!found) return null;
          const b = found.getBounds();
          // Phaser's canvas is the page, so game pixels are page pixels.
          return { x: b.centerX, y: b.centerY };
        }, dir);
        if (at) await page.mouse.click(at.x, at.y);
      } else {
        await page.evaluate((d) => {
          const g = window.__PHASER_GAME__;
          const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
          const hits = [];
          const walk = (o) => {
            if (o.input && o.input.enabled && o.name === `vehicle-arrow-${d}`) hits.push(o);
            if (o.list) o.list.forEach(walk);
          };
          s.container.list.forEach(walk);
          if (hits[0]) hits[0].emit('pointerdown');
        }, dir);
      }
      await page.waitForTimeout(900);
      const state = await page.evaluate(async () => {
        const g = window.__PHASER_GAME__;
        const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
        const names = (ids) => ids.map((id) => s.loadSession.offered.find((a) => a.id === id)?.name);
        const aboardIds = [...s.loadSession.grid.crates].sort((a, b) => a.slotIndex - b.slotIndex).map((c) => c.animalId);
        return {
          vehicle: s.vehicleId,
          aboard: names(aboardIds),
          notice: s.loadNotice?.text ?? null,
          pressed: window.__arrowsLog,
        };
      });
      await page.screenshot({ path: path.join(OUT, `${TAG}-${base}-walk${n + 1}-${dir}.png`) });
      console.log(`${TAG} ${base} walk ${n + 1} ${dir}${KEYS ? ' (key)' : ''}`, JSON.stringify(state), JSON.stringify((await page.evaluate(measure)).vehicles));
    }
  }
  await page.close();
}

await browser.close();
console.log('shots in', OUT);
