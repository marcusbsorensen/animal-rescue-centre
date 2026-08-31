import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForGameReady, waitForScene, mintRealSession, installSession } from './helpers';

/**
 * See the side-nav layout — navigation down the left edge, arrivals down
 * the right, no HUD strip and no bottom bar.
 *
 * The device is the place this gets judged, but the simulator cannot be
 * rotated without a person at the keyboard (osascript is refused
 * assistive access and simctl has no verb — see .claude/TRAPS.md), and
 * the questions this run *can* answer do not need real thumbs: what
 * shape the room ends up, whether the rail's controls clear MIN_TAP and
 * each other, and how far up the screen the top control sits.
 *
 * Both layouts are shot at the same viewport so they can be put side by
 * side. 874x402 with a 50pt inset is an iPhone 17 Pro in landscape with
 * the Dynamic Island on the leading edge.
 */

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '__siderail__');

const PHONE = { width: 874, height: 402 };
const ISLAND = 50;

interface Rect { x: number; y: number; w: number; h: number }
interface Drawn extends Rect { label: string; depth: number; text?: string; texture?: string }

interface Report {
  sceneSize: { width: number; height: number };
  play: Rect;
  /** Everything navContainer drew, so the rail's controls can be named. */
  navChildren: Drawn[];
  /** Interactive rectangles in the nav container, top to bottom. */
  controls: { label: string; hit: Rect }[];
  /** The room background's drawn rect, for the aspect it ends up at. */
  background: Rect | null;
  highDepth: { label: string; depth: number }[];
  iframes: string[];
}

test.use({ deviceScaleFactor: 2 });

async function dismissArrival(page: import('@playwright/test').Page): Promise<void> {
  const frame = page.frameLocator('iframe[aria-label="A.R.C. arrival screen"]');
  const welcome = frame.locator('#welcome-btn, .choice-welcome').first();
  try {
    await welcome.click({ timeout: 4000 });
    await page.waitForTimeout(1500);
  } catch {
    // No plaque up — nothing to answer.
  }
}

async function measure(page: import('@playwright/test').Page): Promise<Report> {
  return page.evaluate(() => {
    const game = (window as unknown as { __PHASER_GAME__: Phaser.Game }).__PHASER_GAME__;
    const scene = game.scene.getScene('GameScene') as unknown as {
      scale: { width: number; height: number };
      navContainer: Phaser.GameObjects.Container;
      gameContainer: Phaser.GameObjects.Container;
      children: { list: Phaser.GameObjects.GameObject[] };
    };

    const rect = (o: Phaser.GameObjects.GameObject): Rect => {
      const b = (o as unknown as { getBounds: () => Phaser.Geom.Rectangle }).getBounds();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    };

    const walk = (c: Phaser.GameObjects.Container): Drawn[] => {
      const out: Drawn[] = [];
      const visit = (o: Phaser.GameObjects.GameObject): void => {
        const any = o as unknown as {
          type: string; depth: number; text?: string;
          texture?: { key: string }; list?: Phaser.GameObjects.GameObject[];
        };
        if (any.list) { any.list.forEach(visit); return; }
        try {
          out.push({
            ...rect(o), label: any.type, depth: any.depth ?? 0,
            text: any.text, texture: any.texture?.key,
          });
        } catch { /* Graphics contributes no bounds */ }
      };
      c.list.forEach(visit);
      return out;
    };

    // Interactive rectangles are the tap targets; the label beneath each
    // one names it. Pair them by vertical proximity within the rail.
    const navChildren = walk(scene.navContainer);
    const hits = scene.navContainer.list
      .filter((o) => (o as unknown as { input?: unknown }).input)
      .map((o) => rect(o))
      .sort((a, b) => a.y - b.y);
    const texts = navChildren.filter((d) => typeof d.text === 'string' && d.text.length > 0);
    const controls = hits.map((hit) => {
      const inside = texts
        .filter((t) => t.y >= hit.y && t.y <= hit.y + hit.h)
        .sort((a, b) => b.y - a.y)[0];
      return { label: inside?.text ?? '?', hit };
    });

    // The background is the largest image in gameContainer.
    const bgs = walk(scene.gameContainer).filter((d) => d.texture && d.texture.startsWith('bg-'));
    const background = bgs.sort((a, b) => b.w * b.h - a.w * a.h)[0] ?? null;

    const play = (window as unknown as {
      __PLAY__?: Rect;
    }).__PLAY__ ?? { x: 0, y: 0, w: 0, h: 0 };

    return {
      sceneSize: { width: scene.scale.width, height: scene.scale.height },
      play,
      navChildren,
      controls,
      background: background ? { x: background.x, y: background.y, w: background.w, h: background.h } : null,
      highDepth: scene.children.list
        .map((o) => o as unknown as { type: string; depth: number })
        .filter((o) => (o.depth ?? 0) >= 9000)
        .map((o) => ({ label: o.type, depth: o.depth })),
      iframes: Array.from(document.querySelectorAll('iframe')).map((f) => f.getAttribute('aria-label') ?? '?'),
    } as Report;
  });
}

test('the side-nav layout, next to the bottom bar it replaces', async ({ page }) => {
  test.setTimeout(180_000);
  fs.mkdirSync(OUT, { recursive: true });

  const session = await mintRealSession();
  const results: Record<string, Report> = {};

  for (const variant of ['bar', 'rail'] as const) {
    await page.setViewportSize(PHONE);
    await installSession(page, session);
    await page.addInitScript((v) => {
      localStorage.setItem('arc_side_rail', v === 'rail' ? '1' : '0');
    }, variant);

    const flag = variant === 'rail' ? '1' : '0';
    await page.goto(`/?sideRail=${flag}&safeAreaLeft=${ISLAND}`);
    await waitForGameReady(page);

    await page.frameLocator('iframe[aria-label="A.R.C. menu screen"]')
      .locator('#continue-btn').click({ timeout: 30_000 });
    await page.frameLocator('iframe[aria-label="A.R.C. intro screen"]')
      .locator('#stage').click({ timeout: 30_000 });
    await waitForScene(page, 'GameScene', 30_000);
    await page.waitForTimeout(3000);
    await dismissArrival(page);

    results[variant] = await measure(page);
    await page.screenshot({ path: path.join(OUT, `${variant}.png`) });
  }

  fs.writeFileSync(path.join(OUT, 'side-rail-report.json'), JSON.stringify(results, null, 2));

  const rail = results.rail;
  const bar = results.bar;

  // Nothing standing over the scene in either shot, or the pictures are
  // of a re-auth scrim rather than of a layout.
  for (const [name, r] of Object.entries(results)) {
    expect(r.highDepth, `${name}: something is drawn at depth >= 9000`).toEqual([]);
    expect(r.sceneSize.width, `${name}: scene did not lay out for the viewport`).toBe(PHONE.width);
    expect(r.sceneSize.height, `${name}: scene did not lay out for the viewport`).toBe(PHONE.height);
  }

  // The room gets taller and closer to the art's own 16:9.
  expect(rail.background, 'no room background drawn under the rail').not.toBeNull();
  expect(bar.background, 'no room background drawn under the bar').not.toBeNull();
  expect(rail.background!.h).toBeGreaterThan(bar.background!.h - 1);

  // Four controls, and the stack has to sit where a thumb goes.
  //
  // This is the constraint that set the item count: a cell is 56 and the
  // gaps are MIN_TAP_GAP, so five need 328 of 402 and start 16% down —
  // bottom-anchored and still not reachable. Four need 260 and start a
  // third of the way down, which is the lower two-thirds the relayout
  // asked for. Adding a fifth item breaks this assertion, which is the
  // point of it.
  const sorted = [...rail.controls].sort((a, b) => a.hit.y - b.hit.y);
  expect(sorted).toHaveLength(4);
  expect(sorted[0].hit.y / PHONE.height).toBeGreaterThan(0.3);
  for (const c of sorted) {
    expect(c.hit.w, `rail control ${c.label} too narrow`).toBeGreaterThanOrEqual(48);
    expect(c.hit.h, `rail control ${c.label} too short`).toBeGreaterThanOrEqual(48);
  }
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i].hit.y - (sorted[i - 1].hit.y + sorted[i - 1].hit.h);
    expect(gap, `rail controls ${sorted[i - 1].label}/${sorted[i].label} too close`).toBeGreaterThanOrEqual(12);
  }
});
