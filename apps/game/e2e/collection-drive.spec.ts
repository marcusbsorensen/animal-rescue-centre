/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  waitForGameReady, waitForScene, mintRealSession, installSession, collectConsoleErrors,
} from './helpers';

/**
 * Collection drives, end to end in real Chrome.
 *
 * The in-app browser pane cannot run Phaser (see .claude/TRAPS.md), so
 * this is the only place the feature can actually be seen. It walks one
 * call from the map pin to the arrival plaque and captures each beat at
 * both shipping viewports.
 *
 *   pnpm --filter @arc/game exec playwright test e2e/collection-drive.spec.ts
 *
 * Artefacts land in e2e/__collection__/.
 *
 * **The canvas stages are driven through the scene, not through taps.**
 * TRAPS is explicit that this harness is not trustworthy for input: an
 * `ErrorOverlay` scrim can take every click while `hitTest` still
 * reports the right object. The map is DOM and is clicked for real; past
 * that the spec calls the handler each button calls, and separately
 * measures the button that would have been tapped — which is the part
 * the 48px rule is actually about.
 */

const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '__collection__',
);
fs.mkdirSync(OUT, { recursive: true });

/** The two shipping viewports the UX audit measures at. */
const SIZES = [
  { name: '812x375', width: 812, height: 375 },
  { name: '820x620', width: 820, height: 620 },
] as const;

const EXPECTED_NOISE = [
  'Failed to fetch', 'status code 401', 'Access to fetch at',
  'blocked by CORS policy', 'net::ERR_FAILED', 'Texture key already in use',
  'AuthSessionMissing', 'NetworkError', 'Download the React DevTools',
  // `PtvDriveScene.preload` asks for a `-building` and a `-place` for
  // every destination and tolerates the misses — that is the design
  // ("one building per destination" is the standing art ask), and the
  // two new collection sources are simply the next two unpainted ones.
  // Their forecourts draw the chrome signboard instead.
  'Failed to process file',
  // The harness account is shared and the Supabase behind it is
  // production, so a save from another run comes back as a version
  // conflict. The merge path handles it; the 409 reaches the console.
  'status of 409',
];
const isNoise = (m: string) => EXPECTED_NOISE.some((n) => m.includes(n));

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT, `${name}.png`) });

/**
 * The live PtvDriveScene, inside the page.
 *
 * Declared as a string and spliced into each `evaluate` body rather than
 * passed in, because a Phaser scene cannot cross the bridge — it is full
 * of circular references and DOM nodes. Everything these snippets hand
 * back is plain data.
 */
const DRIVE = `window.__PHASER_GAME__.scene.scenes.find((s) => s.sys.settings.key === 'PtvDriveScene')`;

/** Run a statement body in the page and bring back whatever it returns. */
function inPage<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(new Function(`return (() => { ${body} })()`) as () => T);
}

async function bootToGame(page: Page): Promise<void> {
  const session = await mintRealSession();
  await installSession(page, session);
  await page.goto('/');
  await waitForGameReady(page);

  // The front door — stopping the scenes by hand races the menu's own
  // async mount (TRAPS). CONTINUE, then the intro's stage tap.
  const menu = page.frameLocator('iframe[aria-label="A.R.C. menu screen"]');
  await menu.locator('#continue-btn').click({ timeout: 25_000 });
  const intro = page.frameLocator('iframe[aria-label="A.R.C. intro screen"]');
  await intro.locator('#stage').click({ timeout: 8_000 }).catch(() => { /* already through */ });
  await waitForScene(page, 'GameScene', 30_000);
  await page.waitForTimeout(1500);
}

/**
 * Put the game where a collection call lives: level 6 so both pins are
 * open, the PTV in service, an empty centre so there is room at home,
 * and one call waiting at the farm.
 */
async function seedCall(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__PHASER_GAME__;
    const store = g.registry.get('gameStore');
    store.level = 6;
    store.hasCompletedFirstDrive = true;
    store.animals = [];
    store.sickAnimals.clear();
    store.collectionCalls = [{
      id: 'call-goose-end-farm-harness',
      destinationId: 'goose-end-farm',
      species: 'dog',
      variant: 'collie',
      calledAt: Date.now(),
    }];
    g.scene.scenes
      .find((s: any) => s.sys.settings.key === 'GameScene')
      ?.renderView();
  });
  await page.waitForTimeout(500);
}

for (const size of SIZES) {
  test(`a collection drive, at ${size.name}`, async ({ page }) => {
    test.setTimeout(200_000);
    const errors = collectConsoleErrors(page);
    await page.setViewportSize({ width: size.width, height: size.height });

    await bootToGame(page);
    await seedCall(page);

    // ── 1. The map, with the call riding the pin ──
    await page.evaluate(() => {
      (window as any).__PHASER_GAME__.scene.scenes
        .find((s: any) => s.sys.settings.key === 'GameScene')
        .openMapOverlay();
    });
    const map = page.frameLocator('iframe[aria-label="A.R.C. map"]');
    const pin = map.locator('.pin-place.has-call').first();
    await pin.waitFor({ timeout: 25_000 });
    await page.waitForTimeout(1000);
    await shot(page, `collection-map-${size.name}`);

    // The pin wears the species — the one thing on the map a pre-reader
    // can read — and its tap target clears MIN_TAP whatever the disc is
    // drawn at.
    expect(await pin.locator('.pin-call').textContent()).toBe('🐶');
    const padded = await pin.locator('.pin-disc').evaluate((el) => {
      const r = getComputedStyle(el, '::before');
      return { w: parseFloat(r.width), h: parseFloat(r.height) };
    });
    expect(padded.w).toBeGreaterThanOrEqual(48);
    expect(padded.h).toBeGreaterThanOrEqual(48);

    // ── 2. The card, which says what the trip is for ──
    await pin.click();
    await map.locator('.dest-card').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await shot(page, `collection-card-${size.name}`);
    expect(await map.locator('.dest-call').textContent()).toContain('dog is waiting');

    // ── 3. The drive out, with an empty bed and no loading screen ──
    await map.locator('.dest-btn', { hasText: 'Drive here!' }).click();
    await waitForScene(page, 'PtvDriveScene', 25_000);
    await page.waitForTimeout(1400);
    await shot(page, `collection-picker-${size.name}`);

    const outbound = await inPage<{ cargo: number; collect: string | null }>(page, `
      const d = ${DRIVE};
      d.vehicleId = 'small-van';
      d.phase = 'travel';
      d.renderView();
      return { cargo: d.cargo.length, collect: d.collect ? d.collect.name : null };
    `);
    // Design point one, asserted: nobody rides out, so the loading
    // screen never opens on the way there.
    expect(outbound.cargo).toBe(0);
    expect(outbound.collect).not.toBeNull();
    await page.waitForTimeout(1600);
    await shot(page, `collection-drive-${size.name}`);

    // ── 4. The pickup forecourt: she is standing on it ──
    await inPage(page, `const d = ${DRIVE}; d.phase = 'arrival'; d.renderView();`);
    await page.waitForTimeout(2400);
    await shot(page, `collection-pickup-${size.name}`);

    const prompt = await inPage<{
      labels: string[]; box: { w: number; h: number } | null; name: string;
    }>(page, `
      const d = ${DRIVE};
      const labels = [];
      let box = null;
      for (const o of d.container.list) {
        if (o.type !== 'Container' || !Array.isArray(o.list)) continue;
        const text = o.list.filter((c) => c.type === 'Text').map((c) => c.text).join(' ');
        if (!text) continue;
        labels.push(text);
        if (text.indexOf('Lift') === 0) {
          const b = o.getBounds();
          box = { w: b.width, h: b.height };
        }
      }
      return { labels, box, name: d.collect ? d.collect.name : '' };
    `);
    // The one control names her, and it is a real target.
    expect(prompt.labels.join(' | ')).toContain(`Lift ${prompt.name} in`);
    expect(prompt.box?.h ?? 0).toBeGreaterThanOrEqual(48);
    expect(prompt.box?.w ?? 0).toBeGreaterThanOrEqual(48);

    // ── 5. The loading screen, where the animal is ──
    await inPage(page, `const d = ${DRIVE}; d.beginCollectionLoad(d.collect);`);
    await page.waitForTimeout(1400);
    await shot(page, `collection-loading-${size.name}`);

    const opened = await inPage<{
      phase: string; crates: number; offered: number; id: string;
    }>(page, `
      const d = ${DRIVE};
      return {
        phase: d.phase,
        crates: d.loadSession.grid.crates.length,
        offered: d.loadSession.offered.length,
        id: d.loadSession.offered[0].id,
      };
    `);
    expect(opened.phase).toBe('loading');
    expect(opened.offered).toBe(1);
    // Nobody is seated for her: the crate is the child's choice, which
    // is the only reason this screen is here at all.
    expect(opened.crates).toBe(0);

    // ── 6. Pick a crate, pick a space ──
    //
    // `putIntoCrate` is the one the view calls for a drag onto a crate;
    // it picks her up itself. Then the bay.
    //
    // **`secure`, which is deliberately not the species default.** A
    // dog's first preference is `standard`, so choosing the secure crate
    // is the case where the drawn bay and the default disagree — the
    // exact bug the loading bay shipped on 2026-10-09, and the thing
    // that proves the child's choice reached the crate she travels in.
    const chosen = await inPage<{ crateType: string | null; slot: number | null }>(page, `
      const d = ${DRIVE};
      d.putIntoCrate('${opened.id}', 'secure');
      d.placeIntoBay(d.loadSession, 0);
      const c = d.loadSession.grid.crates[0];
      return { crateType: c ? c.crateType : null, slot: c ? c.slotIndex : null };
    `);
    expect(chosen.crateType).toBe('secure');
    expect(chosen.slot).toBe(0);
    await page.waitForTimeout(700);
    await shot(page, `collection-crated-${size.name}`);

    // ── 7. Home, and the arrival plaque ──
    await inPage(page, `const d = ${DRIVE}; d.setOffFromLoading(d.loadSession);`);
    await waitForScene(page, 'GameScene', 25_000);

    // **Read the shelter the moment she lands, not at leisure.**
    //
    // The harness drives the live production Supabase through one shared
    // account (there is no staging project — see TRAPS), so a save from
    // a parallel or previous run can come back as a stale-version
    // conflict seconds later and merge a different shelter over this
    // one. That is the harness's problem and not the game's; polling for
    // her arrival rather than sampling the store afterwards keeps the
    // assertion about the feature.
    const home = await page.waitForFunction(() => {
      const store = (window as any).__PHASER_GAME__.registry.get('gameStore');
      const collie = store.animals.find(
        (a: any) => a.species === 'dog' && a.variant === 'collie',
      );
      if (!collie) return null;
      return {
        state: collie.state,
        farmCall: store.collectionCalls
          .some((c: any) => c.destinationId === 'goose-end-farm'),
      };
    }, null, { timeout: 20_000 }).then((h) => h.jsonValue()) as
      { state: string; farmCall: boolean };

    // The three things the brief asks for, at the far end of a real
    // journey: she is in the shelter, she is the animal the pin said she
    // was, and the call that brought her has been answered.
    expect(home.state).toBe('arriving');
    // The farm's call specifically, not the count: the 45-second
    // arrival timer is still running through all this and may well have
    // rung somewhere else by now, which is the feature working.
    expect(home.farmCall).toBe(false);

    await page.waitForTimeout(2500);
    await shot(page, `collection-arrival-${size.name}`);

    // The plaque says how she came to be here, and it is the trip the
    // child just made rather than the gate's "someone dropped her off".
    const plaque = page.frameLocator('iframe[aria-label="A.R.C. arrival"]');
    const subtitle = await plaque.locator('#arrivalSubtitle')
      .textContent({ timeout: 10_000 });
    expect(subtitle).toContain('Goose End Farm');
    expect(subtitle).not.toContain('dropped off');

    const real = errors.filter((e) => !isNoise(e));
    expect(real, `console errors:\n${real.join('\n')}`).toEqual([]);
  });
}

/**
 * The two ways a collection pin declines, both of them before the child
 * has driven anywhere.
 *
 * This is design point three in the browser: the shelter's cap is
 * answered on the map, where it costs a tap, rather than at the far end
 * of a journey, where it would cost the journey.
 */

/** Open the map over the running GameScene. */
async function openMap(page: Page) {
  await page.evaluate(() => {
    (window as any).__PHASER_GAME__.scene.scenes
      .find((s: any) => s.sys.settings.key === 'GameScene')
      .openMapOverlay();
  });
  const map = page.frameLocator('iframe[aria-label="A.R.C. map"]');
  await map.locator('.pin-place').first().waitFor({ timeout: 25_000 });
  // `placePins` runs again on two timers after the SVG loads and closes
  // any open card when it does, so a card opened inside that first
  // second vanishes under the test. Let the map settle first.
  await page.waitForTimeout(1200);
  return map;
}

test('a collection pin with nobody waiting offers no drive', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 820, height: 620 });
  await bootToGame(page);
  await seedCall(page);

  // Bay Chapel is open at level 6 and has not rung. Its card says how
  // it stands and keeps one honest control — no journey to an empty
  // forecourt.
  const map = await openMap(page);
  const chapel = map.locator('.pin-place', { hasText: 'Bay Chapel' });
  await expect(chapel).not.toHaveClass(/has-call/);
  await chapel.click();
  await map.locator('.dest-card').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
  await shot(page, 'collection-quiet-card');

  expect(await map.locator('.dest-call').textContent()).toContain('All quiet');
  await expect(map.locator('.dest-btn', { hasText: 'Drive here!' })).toHaveCount(0);
});

test('a full shelter takes the call off the map until there is a bed', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 820, height: 620 });
  await bootToGame(page);
  await seedCall(page);

  // Before: the farm is ringing and the pin wears the dog.
  const before = await openMap(page);
  await expect(before.locator('.pin-place', { hasText: 'Goose End Farm' }))
    .toHaveClass(/has-call/);

  // Fill the shelter to its level-6 ceiling. The call stays on the
  // save; the map simply stops offering it, which is what keeps a child
  // from driving out for an animal she would have nowhere to put.
  const stillThere = await page.evaluate(() => {
    const g = (window as any).__PHASER_GAME__;
    const store = g.registry.get('gameStore');
    store.animals = Array.from({ length: 14 }, (_, i) => ({
      id: `full-${i}`, name: `Full${i}`, species: 'cat', state: 'sheltered',
      arrivalStory: '', hunger: 10, tiredness: 10, happiness: 80, health: 90,
      bondLevel: 0, roomId: 'room-cat',
    }));
    g.scene.scenes
      .find((s: any) => s.sys.settings.key === 'GameScene')
      .openMapOverlay();
    return store.collectionCalls.length;
  });
  expect(stillThere).toBe(1);

  const map = page.frameLocator('iframe[aria-label="A.R.C. map"]');
  const farm = map.locator('.pin-place', { hasText: 'Goose End Farm' });
  await farm.waitFor({ timeout: 25_000 });
  await page.waitForTimeout(1200);
  await expect(farm).not.toHaveClass(/has-call/);

  await farm.click();
  await map.locator('.dest-card').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
  await shot(page, 'collection-full-shelter-card');
  await expect(map.locator('.dest-btn', { hasText: 'Drive here!' })).toHaveCount(0);
});
