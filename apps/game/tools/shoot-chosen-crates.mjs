/**
 * Throwaway probe: the bed with animals in NON-DEFAULT crates, so the
 * six crate designs are actually visible, plus Trikey's bed.
 *
 * The Claude browser pane cannot run Phaser, so this goes through real
 * Chrome under Playwright, as `.claude/TRAPS.md` requires. The session
 * is driven through the rules' own API — `holdFromTray`,
 * `putHeldInCrate`, `placeHeld` — rather than by tapping, because the
 * Chrome harness is not trustworthy for input on this screen; this is
 * the same state a tap reaches.
 *
 * Usage: node shoot-chosen-crates.mjs <outdir>
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] ?? '/tmp/arc-shots';
const BASE = 'http://localhost:5173';
const LOGIC = '/@fs/Users/marcus/Projects/animal-rescue-centre/packages/game-logic/src/index.ts';
const CARGO = 'cat,bunny,dog,hedgehog,snake,bat';
const SIZES = [
  { w: 820, h: 620, tag: '820x620' },
  { w: 812, h: 375, tag: '812x375' },
];

/**
 * Who goes where, and in what — every one of them a crate that is NOT
 * the species default, so the picture can only be right if the drawing
 * reads `crateType` rather than the species.
 *
 *   cat      default standard          -> wicker basket
 *   bunny    default ventilated-basket -> standard
 *   dog      default standard          -> secure
 *   hedgehog default ventilated-basket -> quiet
 *
 * **Every one of them is still a crate that suits her**, which the
 * rules' own preference lists allow and `describeCrateChoice` confirms
 * in words. A screenshot full of unsuitable crates would prove the
 * same point and read as a broken screen.
 *
 * Big Tilly's four go in slots 0, 3, 4 and 7 — pairwise non-adjacent
 * in a 2x4 — so nobody is refused for frightening a neighbour and the
 * bays are what the picture is about. Henry's three and Trikey's two
 * are neighbours, and every pair of them is `stressed` at worst.
 */
const PLAN = {
  'animal-lorry': [
    ['cat', 'ventilated-basket', 0], ['bunny', 'standard', 3],
    ['hedgehog', 'quiet', 4], ['dog', 'secure', 7],
  ],
  'small-van': [
    ['cat', 'ventilated-basket', 0], ['dog', 'secure', 1], ['hedgehog', 'quiet', 2],
  ],
  // Two bays, in line, and the screen this one is really about: her
  // portrait was repainted today, so her bed is photographed at both
  // sizes with the bays full.
  'pedal-trike': [
    ['cat', 'quiet', 0], ['hedgehog', 'standard', 1],
  ],
};

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

async function ready(page) {
  await page.waitForFunction(() => {
    const g = window.__PHASER_GAME__;
    return !!g && g.scene.scenes.some(
      (s) => s.sys.settings.active && s.sys.settings.key === 'PtvDriveScene',
    );
  }, { timeout: 40_000 });
  await page.waitForTimeout(2000);
}

for (const { w, h, tag } of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.error('PAGEERROR', tag, e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || /crate loading/.test(m.text())) {
      console.log(`CONSOLE ${tag}`, m.type(), m.text().slice(0, 200));
    }
  });

  for (const [vehicle, plan] of Object.entries(PLAN)) {
    await page.goto(`${BASE}/?ptvDemo=1&cargo=${CARGO}`, { waitUntil: 'load' });
    await ready(page);
    await page.evaluate((vid) => {
      const g = window.__PHASER_GAME__;
      const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
      s.pickAndDepart(vid, { clearTint() {}, setDepth() {} }, 0, 0);
    }, vehicle);
    await page.waitForTimeout(1400);

    const placed = await page.evaluate(async ([steps, logic]) => {
      const m = await import(logic);
      const g = window.__PHASER_GAME__;
      const s = g.scene.scenes.find((x) => x.sys.settings.key === 'PtvDriveScene');
      const done = [];
      for (const [species, crate, slot] of steps) {
        const who = m.waitingToBoard(s.loadSession).find((a) => a.species === species);
        if (!who) { done.push(`${species}: not waiting`); continue; }
        s.loadSession = m.putHeldInCrate(m.holdFromTray(s.loadSession, who.id), crate);
        const out = m.placeHeld(s.loadSession, slot);
        if (!out.placed) { done.push(`${who.name} the ${species}: REFUSED at ${slot}`); continue; }
        s.loadSession = out.session;
        done.push(`${who.name} the ${species} in ${crate} at ${slot}`);
      }
      s.loadNotice = null;
      s.renderView();
      // What the bays were actually asked to draw, read back off the
      // live scene rather than inferred.
      const all = [];
      const walk = (o) => { all.push(o); if (o.list) o.list.forEach(walk); };
      s.container.list.forEach(walk);
      const drawn = all
        .filter((o) => o.type === 'Image' && o.texture && /^crate-/.test(o.texture.key))
        .map((o) => ({
          key: o.texture.key,
          cx: Math.round(o.getBounds().centerX),
          cy: Math.round(o.getBounds().centerY),
          w: Math.round(o.displayWidth),
        }))
        .sort((a, b) => a.cy - b.cy || a.cx - b.cx);
      return {
        done,
        drawn,
        session: s.loadSession.grid.crates
          .slice()
          .sort((a, b) => a.slotIndex - b.slotIndex)
          .map((c) => `${c.slotIndex}:${c.species}:${c.crateType}`),
      };
    }, [plan, LOGIC]);

    await page.waitForTimeout(800);
    const file = path.join(OUT, `chosen-crates-${vehicle}-${tag}.png`);
    await page.screenshot({ path: file });
    console.log(`\n${tag} ${vehicle}`);
    for (const line of placed.done) console.log('   ', line);
    console.log('    session :', placed.session.join('  '));
    console.log('    drawn   :', placed.drawn.map((d) => `${d.key}@${d.cx},${d.cy} ${d.w}px`).join('  '));
    console.log('    shot    :', file);
  }

  await page.close();
}

await browser.close();
