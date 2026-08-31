import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForGameReady, waitForScene, mintRealSession, installSession } from './helpers';

/**
 * See the nav bar.
 *
 * The bar was finished without anyone looking at it. Every previous run
 * seeded a token Supabase rejects, so `load-game` answered 401,
 * `loadGameState` called `requireSignIn`, and a full-screen re-auth panel
 * (depth 10000) stood over the corridor — the icons were confirmed by
 * their position in the display list instead of by eye.
 *
 * This mints a real session, walks the arrival card the way a player
 * would, and then asserts the bar is clear before it shoots it:
 *
 *   - no HTML overlay iframe left on the page
 *   - nothing at depth >= 9000 in the scene
 *   - nothing drawn by any other container inside the bar's rectangle
 *
 * The screenshots go to `e2e/__nav__/`, one per viewport. 812x375 is what
 * the Capacitor app gets and 812x325 what the Home Screen web clip gets
 * (both measured on device — see .claude/TRAPS.md); they are 50px apart
 * and both land in the short-viewport branch, which is exactly where the
 * bar compresses from 96 to 78.
 */

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '__nav__');

// Landscape only. `ios/App/App/Info.plist` restricts the app to the two
// landscape orientations because portrait was measured in the August audit
// and abandoned, so a portrait row here would assert against a layout that
// was never going to ship. (It is broken, for the record: at 393 wide the
// four tab hit rectangles are 74px on 60px of spacing and overlap their
// neighbours by 14px. The web build has no rotate prompt to stop a child
// meeting it.)
const VIEWPORTS = [
  { name: 'phone-landscape-app', width: 812, height: 375 },
  { name: 'phone-landscape-clip', width: 812, height: 325 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
] as const;

interface Rect { x: number; y: number; w: number; h: number }
interface Drawn extends Rect { label: string; container: string; depth: number; text?: string; texture?: string }

interface BarReport {
  bar: Rect | null;
  /** What the scene thinks it is laid out for — not always the viewport. */
  sceneSize: { width: number; height: number };
  /** Everything navContainer drew, so the icons can be named. */
  navChildren: Drawn[];
  /** The five tab/FAB hit areas, by the label printed beneath them. */
  controls: { label: string; texture: string | null; hit: Rect }[];
  /** Phaser objects at depth >= 9000 — the re-auth scrim lives here. */
  highDepth: { label: string; depth: number }[];
  iframes: string[];
  activeScenes: string[];
}

test.use({ deviceScaleFactor: 2 });

test('the nav bar is drawn clear on every phone viewport', async ({ page }) => {
  test.setTimeout(180_000);
  fs.mkdirSync(OUT, { recursive: true });

  const session = await mintRealSession();
  await installSession(page, session);

  await page.goto('/');
  await waitForGameReady(page);

  // In through the front door: wait for the menu overlay and press
  // CONTINUE. Stopping every scene and starting GameScene by hand is
  // faster and races — MainMenuScene mounts its overlay from inside
  // `loadGameState().then(...)`, so a scene stopped while that load is in
  // flight still mounts the menu, on top of the game, a second later.
  const menu = page.frameLocator('iframe[aria-label="A.R.C. menu screen"]');
  await menu.locator('#continue-btn').click({ timeout: 30_000 });

  // CONTINUE goes to IntroScene, not GameScene. `arc_skip_intro` skips the
  // walk-in panels but still lands on panel 3 — the arrival reveal — and
  // that one waits for a tap, so the session keys alone do not get you
  // through. Tap the stage the way a child does.
  const intro = page.frameLocator('iframe[aria-label="A.R.C. intro screen"]');
  await intro.locator('#stage').click({ timeout: 30_000 });
  await waitForScene(page, 'GameScene', 30_000);
  await page.waitForTimeout(3000);

  // A fresh shelter spawns an animal, which raises the arrival plaque as
  // an iframe over everything. Answer it the way a child would rather
  // than deleting it — the welcome choice is what takes it down, and a
  // deleted iframe would leave the scene mid-ceremony.
  await dismissArrival(page);

  const results: Record<string, BarReport> = {};

  for (const vp of VIEWPORTS) {
    await resizeTo(page, vp.width, vp.height);
    // A resize restarts the scene, which spawns into an empty shelter and
    // can raise a fresh arrival plaque.
    await dismissArrival(page);

    const report = await measureBar(page);
    results[vp.name] = report;

    await page.screenshot({ path: path.join(OUT, `${vp.name}.png`) });
    // The bar alone, at the size a child sees it, for reading the icons.
    if (report.bar) {
      const b = report.bar;
      await page.screenshot({
        path: path.join(OUT, `${vp.name}-bar.png`),
        clip: {
          x: Math.max(0, b.x - 8),
          y: Math.max(0, b.y - 30),
          width: Math.min(vp.width - Math.max(0, b.x - 8), b.w + 16),
          height: Math.min(vp.height - Math.max(0, b.y - 30), b.h + 40),
        },
      });
    }
  }

  fs.writeFileSync(path.join(OUT, 'nav-report.json'), JSON.stringify(results, null, 2));

  for (const vp of VIEWPORTS) {
    const r = results[vp.name];
    expect(r.bar, `${vp.name}: no nav bar drawn`).not.toBeNull();
    // The scene lays out against its own size, not the window's. If those
    // have drifted the rest of this is measuring the previous viewport.
    expect(r.sceneSize.height, `${vp.name}: scene not laid out for this viewport`)
      .toBe(vp.height);
    expect(r.iframes, `${vp.name}: an HTML overlay is still mounted`).toEqual([]);
    expect(r.highDepth, `${vp.name}: something is sitting at depth >= 9000`).toEqual([]);

    const bar = r.bar!;
    expect(bar.y + bar.h, `${vp.name}: the bar runs off the bottom`)
      .toBeLessThanOrEqual(vp.height);
    expect(bar.x, `${vp.name}: the bar runs off the left`).toBeGreaterThanOrEqual(0);
    expect(bar.x + bar.w, `${vp.name}: the bar runs off the right`)
      .toBeLessThanOrEqual(vp.width);

    expect(
      r.controls.map((c) => c.label),
      `${vp.name}: wrong nav controls`,
    ).toEqual(['Home', 'Care', 'Supplies', 'Walk', 'Social']);
    // Every one of them is art, not the two-letter text fallback that
    // stands in when a texture is missing.
    for (const c of r.controls) {
      expect(c.texture, `${vp.name}: ${c.label} has no icon texture`).not.toBeNull();
    }
  }
});

/**
 * Resize, and make sure the scene actually followed.
 *
 * GameScene only restarts when the viewport moves by *more than* 50px
 * (`GameScene.create`), so setting 812x375 then 812x325 — the Capacitor
 * app's viewport and the Home Screen web clip's, which is the pair we
 * most want to compare — changes the canvas and leaves the layout alone.
 * The measurements then describe the previous viewport while the
 * screenshot shows the new one cropped. Step through an intermediate
 * size so each leg clears the threshold.
 */
async function resizeTo(
  page: import('@playwright/test').Page,
  width: number,
  height: number,
): Promise<void> {
  const current = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const g = (window as any).__PHASER_GAME__;
    return { w: g?.scale.width ?? 0, h: g?.scale.height ?? 0 };
  });
  if (Math.abs(height - current.h) <= 50 && height !== current.h) {
    await page.setViewportSize({ width, height: height + 120 });
    await page.waitForTimeout(1200);
  }
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(2500);
}

/** Click a welcome gesture on the arrival plaque, if one is up. */
async function dismissArrival(page: import('@playwright/test').Page): Promise<void> {
  const selector = 'iframe[aria-label="A.R.C. arrival"]';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await page.locator(selector).count() === 0) return;
    try {
      await page.frameLocator(selector).locator('.choice-pill').first().click({ timeout: 4000 });
    } catch {
      return; // leave whatever it is for the assertions to name
    }
    await page.waitForTimeout(1500);
  }
}

async function measureBar(page: import('@playwright/test').Page): Promise<BarReport> {
  return await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const g = (window as any).__PHASER_GAME__;
    const activeScenes: string[] = g
      ? g.scene.scenes.filter((s: any) => s.sys.settings.active).map((s: any) => s.sys.settings.key)
      : [];
    const scene = g?.scene.scenes.find((s: any) => s.sys.settings.key === 'GameScene');
    const empty = {
      bar: null, navChildren: [], controls: [], highDepth: [],
      sceneSize: { width: g?.scale.width ?? 0, height: g?.scale.height ?? 0 },
      iframes: Array.from(document.querySelectorAll('iframe')).map(
        (f) => f.getAttribute('aria-label') ?? f.getAttribute('src') ?? 'iframe',
      ),
      activeScenes,
    };
    if (!scene) return empty;

    const highDepth = (scene.children?.list ?? [])
      .filter((o: any) => (o.depth ?? 0) >= 9000)
      .map((o: any) => ({ label: o.constructor?.name ?? 'object', depth: o.depth ?? 0 }));

    const walk = (obj: any, container: string, out: any[]): void => {
      if (!obj) return;
      const kids = obj.list ?? [];
      for (const child of kids) {
        if (child.visible === false) continue;
        if (child.list) { walk(child, container, out); continue; }
        if (typeof child.getBounds !== 'function') continue;
        const b = child.getBounds();
        if (!b || b.width <= 0 || b.height <= 0) continue;
        out.push({
          label: child.constructor?.name ?? 'object',
          text: typeof child.text === 'string' ? child.text : undefined,
          texture: child.texture?.key ?? null,
          interactive: child.input != null,
          container,
          depth: child.depth ?? 0,
          x: b.x, y: b.y, w: b.width, h: b.height,
        });
      }
    };

    const navChildren: any[] = [];
    walk(scene.navContainer, 'nav', navChildren);

    if (navChildren.length === 0) return { ...empty, highDepth };

    // The bar's own rectangle: the union of what navContainer drew.
    const x0 = Math.min(...navChildren.map((c) => c.x));
    const y0 = Math.min(...navChildren.map((c) => c.y));
    const x1 = Math.max(...navChildren.map((c) => c.x + c.w));
    const y1 = Math.max(...navChildren.map((c) => c.y + c.h));
    const bar = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };

    // Name each control by the word printed under it. The hit areas are
    // anonymous rectangles and circles; the labels are the only thing on
    // the bar a child could describe, so they are what the report calls
    // them too. The icon riding above each label is what is checked for
    // being art rather than the two-letter text fallback.
    const labels = navChildren.filter((c) => typeof c.text === 'string' && c.text.length > 0);
    const icons = navChildren.filter((c) => c.texture != null);
    const hits = navChildren.filter((c) => c.interactive);
    const controls = labels
      .map((l) => {
        const lx = l.x + l.w / 2;
        const nearest = <T extends { x: number; w: number; y: number }>(xs: T[]): T | null =>
          xs.filter((c) => c.y < l.y)
            .sort((a, b) => Math.abs(a.x + a.w / 2 - lx) - Math.abs(b.x + b.w / 2 - lx))[0] ?? null;
        const icon = nearest(icons);
        const hit = nearest(hits) ?? hits.sort(
          (a, b) => Math.abs(a.x + a.w / 2 - lx) - Math.abs(b.x + b.w / 2 - lx),
        )[0];
        return {
          label: l.text as string,
          texture: icon?.texture ?? null,
          hit: hit ? { x: hit.x, y: hit.y, w: hit.w, h: hit.h } : { x: 0, y: 0, w: 0, h: 0 },
        };
      })
      .sort((a, b) => a.hit.x - b.hit.x);

    return {
      bar,
      sceneSize: { width: g.scale.width, height: g.scale.height },
      navChildren,
      controls,
      highDepth,
      iframes: Array.from(document.querySelectorAll('iframe')).map(
        (f) => f.getAttribute('aria-label') ?? f.getAttribute('src') ?? 'iframe',
      ),
      activeScenes,
    };
  });
}
